import { supabaseAdmin } from "@/lib/supabase";
import { PageHeader, Table, Badge } from "@/app/_components/ui";
import { setPoiVerification } from "@/app/actions";

export const dynamic = "force-dynamic";

export default async function PoisPage() {
  const db = supabaseAdmin();
  const { data: pois } = await db
    .from("points_of_interest")
    .select("id, name, poi_category, frequency_count, recommendation_score, verification_status, specialities, destinations(slug), areas(name)")
    .order("recommendation_score", { ascending: false });

  return (
    <div>
      <PageHeader eyebrow="Knowledge graph" title="Points of Interest" subtitle={`${pois?.length ?? 0} canonical entities, ranked by recommendation score.`} />
      <Table head={["POI", "Category", "Area", "Freq", "Score", "Status", ""]}>
        {(pois ?? []).map((p: any) => (
          <tr key={p.id} className="transition hover:bg-paper-soft/60">
            <td className="px-5 py-4">
              <div className="font-medium text-ink">{p.name}</div>
              {p.specialities?.length > 0 && (
                <div className="mt-0.5 line-clamp-1 text-xs text-ink-mute">
                  {p.specialities.slice(0, 3).join(" · ")}
                </div>
              )}
            </td>
            <td className="px-5 py-4 text-ink-soft">{p.poi_category ?? "—"}</td>
            <td className="px-5 py-4 text-ink-soft">
              {p.areas?.name ?? "—"}
              <span className="ml-1 font-mono text-[11px] text-ink-mute">{p.destinations?.slug}</span>
            </td>
            <td className="px-5 py-4 font-mono tabular-nums text-ink-soft">{p.frequency_count}×</td>
            <td className="px-5 py-4">
              <span className="font-display text-lg font-semibold tabular-nums text-ink">
                {Math.round((p.recommendation_score ?? 0) * 100)}
              </span>
            </td>
            <td className="px-5 py-4"><Badge value={p.verification_status} /></td>
            <td className="px-5 py-4 text-right">
              {p.verification_status !== "community_verified" ? (
                <form action={setPoiVerification}>
                  <input type="hidden" name="id" value={p.id} />
                  <input type="hidden" name="status" value="community_verified" />
                  <button className="rounded-lg bg-ink px-3 py-1.5 text-xs font-medium text-paper transition hover:bg-vermilion">
                    Verify
                  </button>
                </form>
              ) : (
                <form action={setPoiVerification}>
                  <input type="hidden" name="id" value={p.id} />
                  <input type="hidden" name="status" value="ai_extracted" />
                  <button className="rounded-lg px-3 py-1.5 text-xs font-medium text-ink-mute transition hover:text-ink">
                    Unverify
                  </button>
                </form>
              )}
            </td>
          </tr>
        ))}
      </Table>
    </div>
  );
}
