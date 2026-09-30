import { ReactNode } from "react";

/** Documented. */
export function MetricCard({
  icon,
  label,
  value,
  detail,
  accent = "text-cyan-300"
}: {
  icon: ReactNode;
  label: string;
  value: string;
  detail: string;
  accent?: string;
}) {
  return (
    <article className="group relative overflow-hidden rounded-lg border border-[color:var(--bandscope-border)] bg-[var(--bandscope-surface)] p-4 shadow-[0_18px_60px_rgba(0,0,0,0.24)] backdrop-blur-xl transition hover:-translate-y-0.5 hover:border-cyan-300/40">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(34,211,238,0.16),transparent_35%)] opacity-60 transition group-hover:opacity-100" />
      <div className="relative flex items-start gap-3">
        <div className={`rounded-xl bg-white/5 p-2 ${accent}`}>{icon}</div>
        <div>
          <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-slate-400">{label}</p>
          <p className="mt-1 text-2xl font-semibold tracking-tight text-white">{value}</p>
          <p className="mt-1 text-sm text-slate-400">{detail}</p>
        </div>
      </div>
    </article>
  );
}
