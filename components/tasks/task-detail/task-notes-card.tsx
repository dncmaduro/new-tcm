"use client";

type TaskNotesCardProps = {
  note: string;
  isEditing: boolean;
  onChange: (value: string) => void;
};

export function TaskNotesCard({ note, isEditing, onChange }: TaskNotesCardProps) {
  return (
    <article className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-[0_12px_30px_-24px_rgba(15,23,42,0.35)]">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">Notes</p>
        <h2 className="mt-2 text-xl font-semibold tracking-[-0.03em] text-slate-950">Ghi chú</h2>
      </div>

      {isEditing ? (
        <textarea
          rows={4}
          value={note}
          onChange={(event) => onChange(event.target.value)}
          className="mt-5 w-full rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-700 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
          placeholder="Ghi chú ngắn cho nội bộ hoặc handoff"
        />
      ) : (
        <div className="mt-5 rounded-2xl bg-slate-50 px-4 py-4">
          <p className="whitespace-pre-wrap text-sm leading-6 text-slate-700">
            {note.trim() || "Chưa có ghi chú."}
          </p>
        </div>
      )}
    </article>
  );
}
