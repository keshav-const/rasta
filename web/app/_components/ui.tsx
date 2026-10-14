import Link from "next/link";

export function PageHeader({
  eyebrow,
  title,
  subtitle,
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
}) {
  return (
    <div className="mb-8">
      {eyebrow && (
        <div className="mb-2 font-mono text-[11px] uppercase tracking-[0.25em] text-vermilion">
          {eyebrow}
        </div>
      )}
      <h1 className="font-display text-4xl font-semibold tracking-tight text-ink">{title}</h1>
      {subtitle && <p className="mt-2 max-w-xl text-sm text-ink-mute">{subtitle}</p>}
    </div>
  );
}

export function Stat({
  label,
  value,
  href,
  accent,
}: {
  label: string;
  value: React.ReactNode;
  href?: string;
  accent?: boolean;
}) {
  const inner = (
    <div
      className={`lift relative overflow-hidden rounded-2xl border bg-paper-card p-6 ${
        accent ? "border-vermilion/40" : "border-line"
      } ${href ? "cursor-pointer" : ""}`}
    >
      {accent && (
        <div className="absolute -right-6 -top-6 h-20 w-20 rounded-full bg-vermilion/10 blur-2xl" />
      )}
      <div className="font-mono text-[11px] uppercase tracking-[0.2em] text-ink-mute">{label}</div>
      <div
        className={`mt-3 font-display text-4xl font-semibold tabular-nums ${
          accent ? "text-vermilion" : "text-ink"
        }`}
      >
        {value}
      </div>
    </div>
  );
  return href ? <Link href={href}>{inner}</Link> : inner;
}

const BADGE: Record<string, string> = {
  resolved: "bg-teal-soft text-teal",
  extracted: "bg-teal-soft text-teal",
  transcript_fetched: "bg-paper-soft text-ink-soft",
  gated: "bg-vermilion-soft text-vermilion",
  metadata_fetched: "bg-paper-soft text-ink-mute",
  pending: "bg-vermilion-soft text-vermilion",
  failed: "bg-[#f3d4cf] text-[#a3341c]",
  ai_extracted: "bg-paper-soft text-ink-mute",
  google_verified: "bg-teal-soft text-teal",
  community_verified: "bg-ink text-paper",
};

export function Badge({ value }: { value: string }) {
  const cls = BADGE[value] ?? "bg-paper-soft text-ink-soft";
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 font-mono text-[11px] font-medium tracking-tight ${cls}`}
    >
      {value}
    </span>
  );
}

export function Table({ head, children }: { head: string[]; children: React.ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-line bg-paper-card">
      <table className="w-full text-left text-sm">
        <thead className="border-b border-line text-[11px] uppercase tracking-[0.15em] text-ink-mute">
          <tr>
            {head.map((h) => (
              <th key={h} className="px-5 py-4 font-mono font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-line/70">{children}</tbody>
      </table>
    </div>
  );
}
