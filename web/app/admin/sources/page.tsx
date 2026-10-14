import { supabaseAdmin } from "@/lib/supabase";
import { PageHeader, Table, Badge } from "@/app/_components/ui";

export const dynamic = "force-dynamic";

export default async function SourcesPage() {
  const db = supabaseAdmin();
  const { data: sources } = await db
    .from("sources")
    .select("video_id, title, creator_name, status, travel_score, content_type, view_count, raw_extraction, failure_reason")
    .order("created_at", { ascending: false });

  return (
    <div>
      <PageHeader eyebrow="Ingestion" title="Sources" subtitle={`${sources?.length ?? 0} videos pulled through the pipeline.`} />
      <Table head={["Video", "Creator", "Type", "Score", "Entities", "Views", "Status"]}>
        {(sources ?? []).map((s) => {
          const entities = Array.isArray(s.raw_extraction?.entities) ? s.raw_extraction.entities.length : 0;
          return (
            <tr key={s.video_id} className="transition hover:bg-paper-soft/60">
              <td className="px-5 py-4">
                <a
                  href={`https://youtu.be/${s.video_id}`}
                  target="_blank"
                  rel="noreferrer"
                  className="font-medium text-ink hover:text-vermilion"
                >
                  {s.title ?? s.video_id}
                </a>
                {s.failure_reason && (
                  <div className="mt-0.5 font-mono text-[11px] text-vermilion">{s.failure_reason}</div>
                )}
              </td>
              <td className="px-5 py-4 text-ink-mute">{s.creator_name ?? "—"}</td>
              <td className="px-5 py-4 text-ink-soft">{s.content_type ?? "—"}</td>
              <td className="px-5 py-4 font-mono tabular-nums text-ink-soft">
                {s.travel_score != null ? s.travel_score.toFixed(2) : "—"}
              </td>
              <td className="px-5 py-4 font-mono tabular-nums text-ink-soft">{entities || "—"}</td>
              <td className="px-5 py-4 font-mono tabular-nums text-ink-mute">
                {s.view_count != null ? Intl.NumberFormat("en-IN").format(s.view_count) : "—"}
              </td>
              <td className="px-5 py-4"><Badge value={s.status} /></td>
            </tr>
          );
        })}
      </Table>
    </div>
  );
}
