"use client";

import { SubmitButton } from "@/app/_components/submit-button";

// Visible uniquement pour canEdit=true (voir canWritePageUser sur cette
// page) - les autres utilisateurs voient juste la date en texte, comme
// avant.
export function DatePriseEchantillonCell({
  rapportId,
  date,
  dateLabel,
  canEdit,
  action,
}: {
  rapportId: number;
  date: string;
  dateLabel: string;
  canEdit: boolean;
  action: (formData: FormData) => void | Promise<void>;
}) {
  if (!canEdit) return <>{dateLabel || "-"}</>;

  return (
    <form action={action} className="flex items-center gap-1">
      <input type="hidden" name="rapport_id" value={rapportId} />
      <input
        type="date"
        name="new_date"
        defaultValue={date}
        className="w-36 rounded border border-slate-200 px-1.5 py-0.5 text-xs text-slate-700 focus:border-violet-400 focus:outline-none"
      />
      <SubmitButton
        pendingLabel="..."
        className="rounded bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600 hover:bg-slate-200"
      >
        OK
      </SubmitButton>
    </form>
  );
}
