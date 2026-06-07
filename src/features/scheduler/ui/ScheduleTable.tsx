import { Moon, Sun } from "lucide-react";
import { DaySchedule } from "@/features/scheduler/domain/types";

function cellHighlightClasses(memberId: string | null, highlightMemberId?: string | null) {
  if (!highlightMemberId || !memberId || memberId !== highlightMemberId) return "";
  return "bg-emerald-100/70 font-semibold text-emerald-900 shadow-[inset_0_0_0_1px_rgba(16,185,129,0.35)]";
}

export function ScheduleTable({ rows, highlightMemberId }: { rows: DaySchedule[]; highlightMemberId?: string | null }) {
  return (
    <div className="overflow-hidden rounded-[1rem] border border-white/45 bg-[linear-gradient(180deg,rgba(255,255,255,0.74),rgba(255,255,255,0.56))] shadow-[inset_0_1px_0_rgba(255,255,255,0.7),0_24px_60px_rgba(15,23,42,0.10)] backdrop-blur-2xl">
      <div className="grid grid-cols-[140px_repeat(4,minmax(0,1fr))] border-b border-white/60 bg-white/45 text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500 backdrop-blur-xl">
        <div className="border-r border-white/60 bg-zinc-100/85 px-4 py-4 text-center">Date</div>
        <div className="flex items-center justify-center gap-2 border-r border-white/55 px-4 py-4 text-center">
          <Moon className="h-4 w-4" strokeWidth={2.25} />
          <span>1</span>
        </div>
        <div className="flex items-center justify-center gap-2 border-r border-zinc-300/80 bg-zinc-50/35 px-4 py-4 text-center shadow-[inset_-1px_0_0_rgba(255,255,255,0.5)]">
          <Moon className="h-4 w-4" strokeWidth={2.25} />
          <span>2</span>
        </div>
        <div className="flex items-center justify-center gap-2 border-r border-white/55 px-4 py-4 text-center">
          <Sun className="h-4 w-4" strokeWidth={2.25} />
          <span>1</span>
        </div>
        <div className="flex items-center justify-center gap-2 px-4 py-4 text-center">
          <Sun className="h-4 w-4" strokeWidth={2.25} />
          <span>2</span>
        </div>
      </div>

      {rows.map((row) => (
        <div
          key={row.date}
          className={`grid grid-cols-[140px_repeat(4,minmax(0,1fr))] items-stretch border-b border-white/45 text-sm last:border-b-0 ${
            row.weekend
              ? "bg-[linear-gradient(90deg,rgba(255,247,237,0.78),rgba(255,251,235,0.62))]"
              : "odd:bg-white/20 even:bg-white/10"
          }`}
        >
          <div className="border-r border-white/60 bg-zinc-100/85 px-4 py-4 text-center font-semibold text-zinc-900">
            {row.weekdayLabel}
          </div>
          <div className={`border-r border-white/55 px-4 py-4 text-center text-zinc-700 ${cellHighlightClasses(row.nightIds[0], highlightMemberId)}`}>
            {row.night[0] ?? ""}
          </div>
          <div className={`border-r border-zinc-300/80 bg-zinc-50/35 px-4 py-4 text-center text-zinc-700 shadow-[inset_-1px_0_0_rgba(255,255,255,0.5)] ${cellHighlightClasses(row.nightIds[1], highlightMemberId)}`}>
            {row.night[1] ?? ""}
          </div>
          <div className={`border-r border-white/55 px-4 py-4 text-center text-zinc-700 ${row.weekend ? cellHighlightClasses(row.dayIds[0], highlightMemberId) : ""}`}>
            {row.weekend ? row.day[0] ?? "" : ""}
          </div>
          <div className={`px-4 py-4 text-center text-zinc-700 ${row.weekend ? cellHighlightClasses(row.dayIds[1], highlightMemberId) : ""}`}>
            {row.weekend ? row.day[1] ?? "" : ""}
          </div>
        </div>
      ))}
    </div>
  );
}
