import { DayOverview, DaySchedule } from "@/features/scheduler/domain/types";

export interface EditableDaySchedule {
  date: string;
  weekend: boolean;
  night: [string | null, string | null];
  day: [string | null, string | null];
}

function shiftOptions(day: DayOverview, shiftType: "night" | "day") {
  const shift = day.shifts.find((entry) => entry.shiftType === shiftType);
  if (!shift) return [];

  return shift.candidateIds.map((candidateId, index) => ({
    userId: candidateId,
    name: shift.candidateNames[index] ?? candidateId,
  }));
}

function renderSelect({
  value,
  options,
  disabled,
  onChange,
}: {
  value: string | null;
  options: Array<{ userId: string; name: string }>;
  disabled?: boolean;
  onChange: (nextValue: string | null) => void;
}) {
  return (
    <select
      value={value ?? ""}
      disabled={disabled}
      onChange={(event) => onChange(event.target.value || null)}
      className="w-full rounded-xl border border-white/50 bg-white/65 px-3 py-2 text-sm text-zinc-800 shadow-[inset_0_1px_0_rgba(255,255,255,0.72)] backdrop-blur-xl disabled:cursor-not-allowed disabled:opacity-60"
    >
      <option value="">None</option>
      {options.map((option) => (
        <option key={option.userId} value={option.userId}>
          {option.name}
        </option>
      ))}
    </select>
  );
}

export function EditableScheduleTable({
  rows,
  days,
  values,
  onChange,
}: {
  rows: DaySchedule[];
  days: DayOverview[];
  values: EditableDaySchedule[];
  onChange: (nextValues: EditableDaySchedule[]) => void;
}) {
  const dayByDate = new Map(days.map((day) => [day.date, day]));

  function updateSlot(
    rowDate: string,
    bucket: "night" | "day",
    index: 0 | 1,
    nextValue: string | null,
  ) {
    onChange(
      values.map((row) => {
        if (row.date !== rowDate) return row;
        const nextBucket: [string | null, string | null] = [...row[bucket]] as [string | null, string | null];
        nextBucket[index] = nextValue;
        return {
          ...row,
          [bucket]: nextBucket,
        };
      }),
    );
  }

  return (
    <div className="overflow-hidden rounded-[2rem] border border-white/45 bg-[linear-gradient(180deg,rgba(255,255,255,0.74),rgba(255,255,255,0.56))] shadow-[inset_0_1px_0_rgba(255,255,255,0.7),0_24px_60px_rgba(15,23,42,0.10)] backdrop-blur-2xl">
      <div className="grid grid-cols-[140px_repeat(4,minmax(0,1fr))] border-b border-white/60 bg-white/45 text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500 backdrop-blur-xl">
        <div className="border-r border-white/60 bg-zinc-100/85 px-4 py-4 text-center">Date</div>
        <div className="border-r border-white/55 px-4 py-4 text-center">Night 1</div>
        <div className="border-r border-zinc-300/80 bg-zinc-50/35 px-4 py-4 text-center shadow-[inset_-1px_0_0_rgba(255,255,255,0.5)]">Night 2</div>
        <div className="border-r border-white/55 px-4 py-4 text-center">Day 1</div>
        <div className="px-4 py-4 text-center">Day 2</div>
      </div>

      {rows.map((row, rowIndex) => {
        const day = dayByDate.get(row.date);
        const editable = values[rowIndex];
        const nightOptions = day ? shiftOptions(day, "night") : [];
        const dayOptions = day ? shiftOptions(day, "day") : [];

        return (
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
            <div className="border-r border-white/55 px-3 py-3">
              {renderSelect({ value: editable.night[0], options: nightOptions, onChange: (next) => updateSlot(row.date, "night", 0, next) })}
            </div>
            <div className="border-r border-zinc-300/80 bg-zinc-50/35 px-3 py-3 shadow-[inset_-1px_0_0_rgba(255,255,255,0.5)]">
              {renderSelect({ value: editable.night[1], options: nightOptions, onChange: (next) => updateSlot(row.date, "night", 1, next) })}
            </div>
            <div className="border-r border-white/55 px-3 py-3">
              {renderSelect({
                value: editable.day[0],
                options: dayOptions,
                disabled: !row.weekend,
                onChange: (next) => updateSlot(row.date, "day", 0, next),
              })}
            </div>
            <div className="px-3 py-3">
              {renderSelect({
                value: editable.day[1],
                options: dayOptions,
                disabled: !row.weekend,
                onChange: (next) => updateSlot(row.date, "day", 1, next),
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
