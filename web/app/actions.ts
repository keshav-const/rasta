"use server";

import { revalidatePath } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase";
import { normalize, slugify } from "@/lib/normalize";

const VALID_STANCES = new Set(["recommended", "mentioned", "warned_against", "mixed"]);

async function recountFrequency(db: ReturnType<typeof supabaseAdmin>, entityId: string) {
  const { count } = await db
    .from("entity_evidence")
    .select("*", { count: "exact", head: true })
    .eq("entity_id", entityId);
  await db
    .from("points_of_interest")
    .update({ frequency_count: count ?? 0, updated_at: new Date().toISOString() })
    .eq("id", entityId);
}

async function attachEvidence(
  db: ReturnType<typeof supabaseAdmin>,
  entityId: string,
  sourceId: string,
  entity: any
) {
  const { data: src } = await db
    .from("sources")
    .select("view_count, upload_date")
    .eq("id", sourceId)
    .single();
  const stance = String(entity?.stance ?? "mentioned").toLowerCase();
  await db.from("entity_evidence").upsert(
    {
      entity_id: entityId,
      source_id: sourceId,
      stance: VALID_STANCES.has(stance) ? stance : "mentioned",
      recommendation_strength: entity?.recommendation_strength ?? null,
      extraction_confidence: entity?.extraction_confidence ?? null,
      claims: entity?.claims ?? [],
      source_views_at_extraction: src?.view_count ?? null,
      source_upload_date: src?.upload_date ?? null,
    },
    { onConflict: "entity_id,source_id" }
  );
  await recountFrequency(db, entityId);
}

async function log(
  db: ReturnType<typeof supabaseAdmin>,
  row: { sourceId: string; entity: any; entityId: string | null; matchType: string; notes: string }
) {
  await db.from("entity_resolution_log").insert({
    source_id: row.sourceId,
    raw_name: (row.entity?.raw_name ?? "").slice(0, 300),
    normalized_name: normalize(row.entity?.normalized_name ?? row.entity?.raw_name ?? ""),
    canonical_entity_id: row.entityId,
    match_type: row.matchType,
    match_confidence: null,
    resolved_by: "manual",
    resolution_notes: row.notes,
  });
}

async function getQueueItem(db: ReturnType<typeof supabaseAdmin>, id: string) {
  const { data } = await db
    .from("resolution_review_queue")
    .select("id, source_id, raw_extraction, suggested_match_id")
    .eq("id", id)
    .single();
  return data;
}

/** Set POI verification status (admin manual verification). */
export async function setPoiVerification(formData: FormData) {
  const id = String(formData.get("id"));
  const status = String(formData.get("status"));
  const db = supabaseAdmin();
  await db
    .from("points_of_interest")
    .update({ verification_status: status, updated_at: new Date().toISOString() })
    .eq("id", id);
  revalidatePath("/pois");
}

/** Reject/discard a review item. */
export async function reviewReject(formData: FormData) {
  const id = String(formData.get("id"));
  const db = supabaseAdmin();
  const item = await getQueueItem(db, id);
  if (!item) return;
  await db
    .from("resolution_review_queue")
    .update({ status: "rejected", reviewed_at: new Date().toISOString() })
    .eq("id", id);
  await log(db, { sourceId: item.source_id, entity: item.raw_extraction, entityId: null, matchType: "discarded", notes: "manual_reject" });
  revalidatePath("/review");
}

/** Approve → merge the extracted mention into the suggested canonical POI. */
export async function reviewApproveMerge(formData: FormData) {
  const id = String(formData.get("id"));
  const db = supabaseAdmin();
  const item = await getQueueItem(db, id);
  if (!item?.suggested_match_id) return;
  await attachEvidence(db, item.suggested_match_id, item.source_id, item.raw_extraction);
  await db
    .from("resolution_review_queue")
    .update({ status: "merged", reviewed_at: new Date().toISOString() })
    .eq("id", id);
  await log(db, { sourceId: item.source_id, entity: item.raw_extraction, entityId: item.suggested_match_id, matchType: "manual", notes: "manual_merge" });
  revalidatePath("/review");
}

/** Create a new canonical POI from the extracted mention. */
export async function reviewCreateNew(formData: FormData) {
  const id = String(formData.get("id"));
  const destinationSlug = String(formData.get("destination") || "delhi");
  const db = supabaseAdmin();
  const item = await getQueueItem(db, id);
  if (!item) return;
  const entity = item.raw_extraction;

  const { data: dest } = await db.from("destinations").select("id").eq("slug", destinationSlug).single();
  if (!dest) return;

  const display = String(entity?.normalized_name ?? entity?.raw_name ?? "").trim();
  const norm = normalize(display);
  const area = entity?.location?.area ? slugify(entity.location.area) : null;
  let areaId: string | null = null;
  if (area) {
    const { data: a } = await db.from("areas").select("id").eq("destination_id", dest.id).eq("slug", area).single();
    areaId = a?.id ?? null;
  }
  const entityType = ["poi", "activity"].includes(String(entity?.entity_type)) ? entity.entity_type : "poi";

  const { data: poi } = await db
    .from("points_of_interest")
    .insert({
      destination_id: dest.id,
      area_id: areaId,
      name: display,
      name_local: entity?.raw_name_local ?? null,
      slug: slugify(display) || norm.replace(/\s+/g, "-"),
      normalized_name: norm,
      entity_type: entityType,
      poi_category: entity?.poi_category ?? null,
      attributes: entity?.attributes ?? {},
      verification_status: "ai_extracted",
    })
    .select("id")
    .single();
  if (!poi) return;

  await attachEvidence(db, poi.id, item.source_id, entity);
  await db
    .from("resolution_review_queue")
    .update({ status: "new_entity", reviewed_at: new Date().toISOString() })
    .eq("id", id);
  await log(db, { sourceId: item.source_id, entity, entityId: poi.id, matchType: "new", notes: `manual_new:${destinationSlug}` });
  revalidatePath("/review");
}
