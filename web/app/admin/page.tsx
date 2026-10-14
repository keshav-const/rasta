import { supabaseAdmin } from "@/lib/supabase";
import { PageHeader, Stat } from "@/app/_components/ui";

export const dynamic = "force-dynamic";

export default async function Dashboard() {
  const db = supabaseAdmin();

  const [{ data: sources }, poi, evidence, review] = await Promise.all([
    db.from("sources").select("status"),
    db.from("points_of_interest").select("*", { count: "exact", head: true }),
    db.from("entity_evidence").select("*", { count: "exact", head: true }),
    db.from("resolution_review_queue").select("*", { count: "exact", head: true }).eq("status", "pending"),
  ]);

  const byStatus = (sources ?? []).reduce<Record<string, number>>((acc, r) => {
    acc[r.status] = (acc[r.status] ?? 0) + 1;
    return acc;
  }, {});
  const totalSources = (sources ?? []).length;

  return (
    <div>
      <PageHeader
        eyebrow="Overview"
        title="Command deck"
        subtitle="Every video, entity and decision behind the Delhi + Gurgaon knowledge graph."
      />

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Stat label="Sources" value={totalSources} href="/admin/sources" />
        <Stat label="Canonical POIs" value={poi.count ?? 0} href="/admin/pois" />
        <Stat label="Evidence" value={evidence.count ?? 0} />
        <Stat label="Review queue" value={review.count ?? 0} href="/admin/review" accent />
      </div>

      <h2 className="mb-4 mt-10 font-mono text-[11px] uppercase tracking-[0.25em] text-ink-mute">
        Sources by status
      </h2>
      <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
        {["resolved", "extracted", "transcript_fetched", "gated", "failed"].map((s) => (
          <Stat key={s} label={s} value={byStatus[s] ?? 0} />
        ))}
      </div>
    </div>
  );
}
