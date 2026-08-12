"use client";

import { SubmitButton } from "@/app/_components/submit-button";

// Visible uniquement pour canEdit=true (reserve aux comptes admin, voir
// renameLotCodeAction) - tous les autres utilisateurs voient le code en
// texte simple, comme avant.
export function LotCodeCell({
  ligneId,
  code,
  canEdit,
  action,
}: {
  ligneId: number;
  code: string;
  canEdit: boolean;
  action: (formData: FormData) => void | Promise<void>;
}) {
  if (!canEdit) return <>{code}</>;

  return (
    <form action={action} className="flex items-center gap-1">
      <input type="hidden" name="ligne_id" value={ligneId} />
      <input type="hidden" name="old_code" value={code} />
      <input
        type="text"
        name="new_code"
        defaultValue={code}
        className="w-24 rounded border border-slate-200 px-1.5 py-0.5 text-xs text-slate-700 focus:border-sky-400 focus:outline-none"
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
