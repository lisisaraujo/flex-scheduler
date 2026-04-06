import { DaySchedule } from "@/features/scheduler/domain/types";

export function ScheduleTable({ rows }: { rows: DaySchedule[] }) {
  return (
    <div className="overflow-hidden rounded-3xl border border-zinc-200 bg-white shadow-sm">
      <div className="grid grid-cols-[120px_repeat(4,minmax(0,1fr))] border-b border-zinc-200 bg-zinc-50 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-zinc-500">
        <div>Date</div>
        <div>Night 1</div>
        <div>Night 2</div>
        <div>Day 1</div>
        <div>Day 2</div>
      </div>

      {rows.map((row) => (
        <div
          key={row.date}
          className="grid grid-cols-[120px_repeat(4,minmax(0,1fr))] items-center border-b border-zinc-100 px-4 py-3 text-sm last:border-b-0"
        >
          <div className="font-medium text-zinc-900">{row.weekdayLabel}</div>
          <div className="text-zinc-700">{row.night[0] ?? "Unfilled"}</div>
          <div className="text-zinc-700">{row.night[1] ?? "Unfilled"}</div>
          <div className="text-zinc-700">{row.weekend ? row.day[0] ?? "Unfilled" : "-"}</div>
          <div className="text-zinc-700">{row.weekend ? row.day[1] ?? "Unfilled" : "-"}</div>
        </div>
      ))}
    </div>
  );
}
