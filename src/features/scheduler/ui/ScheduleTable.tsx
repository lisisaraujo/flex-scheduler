import { Moon, Sun } from "lucide-react";
import { DaySchedule } from "@/features/scheduler/domain/types";

export function ScheduleTable({ rows }: { rows: DaySchedule[] }) {
  return (
    <div className="overflow-hidden rounded-[2rem] border border-white/45 bg-[linear-gradient(180deg,rgba(255,255,255,0.74),rgba(255,255,255,0.56))] shadow-[inset_0_1px_0_rgba(255,255,255,0.7),0_24px_60px_rgba(15,23,42,0.10)] backdrop-blur-2xl">
      <div className="grid grid-cols-[120px_repeat(4,minmax(0,1fr))] border-b border-white/45 bg-white/35 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-zinc-500 backdrop-blur-xl">
        <div>Date</div>
        <div className="flex items-center gap-2">
          <Moon className="h-4 w-4" strokeWidth={2.25} />
          <span>1</span>
        </div>
        <div className="flex items-center gap-2">
          <Moon className="h-4 w-4" strokeWidth={2.25} />
          <span>2</span>
        </div>
        <div className="flex items-center gap-2">
          <Sun className="h-4 w-4" strokeWidth={2.25} />
          <span>1</span>
        </div>
        <div className="flex items-center gap-2">
          <Sun className="h-4 w-4" strokeWidth={2.25} />
          <span>2</span>
        </div>
      </div>

      {rows.map((row) => (
        <div
          key={row.date}
          className="grid grid-cols-[120px_repeat(4,minmax(0,1fr))] items-center border-b border-white/35 px-4 py-3 text-sm last:border-b-0 odd:bg-white/20 even:bg-white/8"
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
