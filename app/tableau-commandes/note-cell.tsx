"use client";

import { useState, useTransition } from "react";
import { updateCommandeNoteAction, updateCommandeRemarqueAction } from "./actions";

// Ecriture libre, sauvegarde automatique - demande explicite : pas de
// bouton "Enregistrer", juste ecrire puis quitter la case (ou Entree) pour
// que ca sauvegarde tout seul. Sert pour la ligne "Note" (en haut) et la
// ligne "Remarque" (avant la ligne "Date commande") : seul le champ change.
export function CommandeNoteCell({
  commandeId,
  initialValue,
  canEdit,
  champ = "note",
}: {
  commandeId: number;
  initialValue: string;
  canEdit: boolean;
  champ?: "note" | "remarque";
}) {
  const [prevInitialValue, setPrevInitialValue] = useState(initialValue);
  const [value, setValue] = useState(initialValue);
  const [savedValue, setSavedValue] = useState(initialValue);
  const [errorMessage, setErrorMessage] = useState("");
  const [isPending, startTransition] = useTransition();

  // Revalidation cote serveur apres save -> nouvelle initialValue depuis le
  // parent : resynchronise sans passer par un useEffect (pattern React
  // recommande pour "ajuster un state quand une prop change").
  if (initialValue !== prevInitialValue) {
    setPrevInitialValue(initialValue);
    setValue(initialValue);
    setSavedValue(initialValue);
  }

  function save() {
    if (value === savedValue) return;

    setErrorMessage("");
    const formData = new FormData();
    formData.set("commande_id", String(commandeId));
    formData.set("note", value);

    startTransition(async () => {
      try {
        await (champ === "remarque" ? updateCommandeRemarqueAction(formData) : updateCommandeNoteAction(formData));
        setSavedValue(value);
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : "Erreur pendant l'enregistrement.");
      }
    });
  }

  if (!canEdit) {
    return <span className="block truncate text-[16px] text-slate-900">{savedValue || "-"}</span>;
  }

  return (
    <div className="flex flex-col items-center gap-0.5">
      <input
        type="text"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        onBlur={save}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            event.currentTarget.blur();
          }
        }}
        disabled={isPending}
        placeholder="-"
        className="w-full min-w-[70px] rounded-md border border-transparent bg-transparent px-1 py-1 text-center text-[16px] font-medium text-slate-950 outline-none focus:border-slate-300 focus:bg-white disabled:opacity-60"
      />
      {errorMessage ? <span className="text-[10px] font-semibold text-red-600">{errorMessage}</span> : null}
    </div>
  );
}
