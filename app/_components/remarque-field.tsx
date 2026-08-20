"use client";

import { useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { SubmitButton } from "./submit-button";

// Meme motif que type-produit-select.tsx (SavedIndicator) - doit etre un
// enfant du <form> pour lire son etat via useFormStatus().
function SavedIndicator() {
  const { pending } = useFormStatus();
  const [justSaved, setJustSaved] = useState(false);
  const wasPending = useRef(false);

  useEffect(() => {
    if (wasPending.current && !pending) {
      setJustSaved(true);
      const timeout = setTimeout(() => setJustSaved(false), 2000);
      return () => clearTimeout(timeout);
    }
    wasPending.current = pending;
  }, [pending]);

  if (pending) return <span className="text-xs text-slate-400">Enregistrement...</span>;
  if (justSaved) return <span className="text-xs font-semibold text-emerald-600">✓ Enregistre</span>;
  return null;
}

// Champ Remarque generique (texte libre), utilise sur Transfer Order et
// Transfer Invoice - un seul <form> avec un id cache + le textarea, pas de
// mode edition a part (toujours modifiable directement si canEdit).
export function RemarqueField({
  action,
  hiddenName,
  hiddenValue,
  remarque,
  canEdit,
}: {
  action: (formData: FormData) => void | Promise<void>;
  hiddenName: string;
  hiddenValue: number;
  remarque: string | null;
  canEdit: boolean;
}) {
  if (!canEdit) {
    if (!remarque) return null;
    return (
      <p className="text-sm text-slate-600">
        <span className="font-semibold text-slate-700">Remarque :</span> {remarque}
      </p>
    );
  }

  return (
    <form action={action} className="flex flex-col gap-2 sm:flex-row sm:items-end sm:gap-3">
      <input type="hidden" name={hiddenName} value={hiddenValue} />
      <label className="grid flex-1 gap-1 text-xs font-semibold text-slate-500">
        Remarque
        <textarea
          name="remarque"
          defaultValue={remarque ?? ""}
          rows={2}
          placeholder="Note optionnelle"
          className="rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none"
        />
      </label>
      <div className="flex items-center gap-2">
        <SubmitButton
          pendingLabel="..."
          className="rounded-full bg-slate-900 px-5 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
        >
          Enregistrer
        </SubmitButton>
        <SavedIndicator />
      </div>
    </form>
  );
}
