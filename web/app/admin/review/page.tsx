import { supabaseAdmin } from "@/lib/supabase";
import { PageHeader } from "@/app/_components/ui";
import { reviewReject, reviewApproveMerge, reviewCreateNew } from "@/app/actions";

export const dynamic = "force-dynamic";

const DEST_MAP: Record<string, string> = {
  delhi: "delhi", "new delhi": "delhi", "central delhi": "delhi", "old delhi": "delhi",
  "south delhi": "delhi", "north delhi": "delhi", "delhi ncr": "delhi", ncr: "delhi",
  gurgaon: "gurgaon", gurugram: "gurgaon",
};

export default async function ReviewPage() {
  const db = supabaseAdmin();
  const { data: items } = await db
    .from("resolution_review_queue")
    .select("id, source_id, raw_extraction, suggested_match_id, suggested_confidence, created_at")
    .eq("status", "pending")
    .order("created_at");

  const ids = [...new Set((items ?? []).map((i) => i.suggested_match_id).filter(Boolean))];
  const nameById: Record<string, string> = {};
  if (ids.length) {
    const { data: pois } = await db.from("points_of_interest").select("id, name").in("id", ids as string[]);
    (pois ?? []).forEach((p) => (nameById[p.id] = p.name));
  }

  return (
    <div>
      <PageHeader eyebrow="Human in the loop" title="Review queue" subtitle={`${items?.length ?? 0} mentions the resolver wasn't confident about.`} />

      {(items?.length ?? 0) === 0 && (
        <div className="rounded-2xl border border-line bg-paper-card p-10 text-center text-ink-mute">
          Queue is clear. Nothing pending.
        </div>
      )}

      <div className="flex flex-col gap-4">
        {(items ?? []).map((item) => {
          const e = item.raw_extraction ?? {};
          const dest = String(e?.location?.destination ?? "");
          const preselect = DEST_MAP[dest.toLowerCase()] ?? "delhi";
          const claims = Array.isArray(e?.claims) ? e.claims : [];
          return (
            <div key={item.id} className="rounded-2xl border border-line bg-paper-card p-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="font-display text-xl font-semibold text-ink">
                    {e?.normalized_name ?? e?.raw_name ?? "(unnamed)"}
                    {e?.raw_name_local && (
                      <span className="ml-2 text-sm font-normal text-ink-mute">{e.raw_name_local}</span>
                    )}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 font-mono text-[11px] text-ink-mute">
                    <span>type · <b className="text-ink-soft">{e?.entity_type ?? "—"}</b></span>
                    <span>category · <b className="text-ink-soft">{e?.poi_category ?? "—"}</b></span>
                    <span>destination · <b className="text-ink-soft">{dest || "—"}</b></span>
                    <span>area · <b className="text-ink-soft">{e?.location?.area ?? "—"}</b></span>
                    <span>conf · <b className="text-ink-soft">{e?.extraction_confidence ?? "—"}</b></span>
                  </div>
                </div>
                {item.suggested_match_id && (
                  <div className="shrink-0 rounded-xl bg-vermilion-soft px-4 py-2.5 text-xs text-vermilion">
                    <div className="font-mono text-[10px] uppercase tracking-widest opacity-70">Suggested</div>
                    <b>{nameById[item.suggested_match_id] ?? "match"}</b>
                    {item.suggested_confidence != null && (
                      <span className="ml-1 font-mono">{item.suggested_confidence}</span>
                    )}
                  </div>
                )}
              </div>

              {claims.length > 0 && (
                <ul className="mt-4 grid grid-cols-1 gap-1 border-t border-line pt-4 text-sm text-ink-soft md:grid-cols-2">
                  {claims.slice(0, 6).map((c: any, i: number) => (
                    <li key={i}>
                      <span className="font-mono text-[11px] text-ink-mute">{c.field}</span> · {c.value}
                    </li>
                  ))}
                </ul>
              )}

              <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-line pt-5">
                {item.suggested_match_id && (
                  <form action={reviewApproveMerge}>
                    <input type="hidden" name="id" value={item.id} />
                    <button className="rounded-lg bg-teal px-3.5 py-2 text-xs font-medium text-paper transition hover:opacity-90">
                      Merge into suggested
                    </button>
                  </form>
                )}
                <form action={reviewCreateNew} className="flex items-center gap-1.5">
                  <input type="hidden" name="id" value={item.id} />
                  <select
                    name="destination"
                    defaultValue={preselect}
                    className="rounded-lg border border-line bg-paper px-2.5 py-2 text-xs text-ink-soft"
                  >
                    <option value="delhi">Delhi</option>
                    <option value="gurgaon">Gurgaon</option>
                  </select>
                  <button className="rounded-lg bg-ink px-3.5 py-2 text-xs font-medium text-paper transition hover:bg-vermilion">
                    Create as new POI
                  </button>
                </form>
                <form action={reviewReject}>
                  <input type="hidden" name="id" value={item.id} />
                  <button className="rounded-lg border border-line px-3.5 py-2 text-xs font-medium text-ink-mute transition hover:border-ink hover:text-ink">
                    Reject
                  </button>
                </form>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
