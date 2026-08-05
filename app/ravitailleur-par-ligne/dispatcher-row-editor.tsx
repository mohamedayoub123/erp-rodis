"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateDispatcherLigneAction } from "./dispatcher-actions";

// Rend les 3 cellules CODE / QT CARTON / QT VRAC d'une ligne Dispatcher,
// dans cet ordre (meme ordre que l'entete du tableau) - QT CARTON reste en
// lecture seule (recalcule cote serveur a partir du nouveau QT VRAC), seuls
// CODE et QT VRAC sont modifiables.
export function DispatcherRowEditor({
  id,
  initialCode,
  initialQtCarton,
  initialQtVrac,
  canEdit,
}: {
  id: number;
  initialCode: string;
  initialQtCarton: number | null;
  initialQtVrac: number | null;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [code, setCode] = useState(initialCode);
  const [qtVrac, setQtVrac] = useState(initialQtVrac !== null ? String(initialQtVrac) : "");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  if (!canEdit) {
    return (
      <>
        <td className="border border-slate-300 bg-white px-3 py-3">{initialCode}</td>
        <td className="border border-slate-300 bg-white px-3 py-3">
          {initialQtCarton !== null ? Math.round(initialQtCarton).toLocaleString("fr-FR") : ""}
        </td>
        <td className="border border-slate-300 bg-white px-3 py-3">
          {initialQtVrac !== null ? initialQtVrac.toLocaleString("fr-FR") : ""}
        </td>
      </>
    );
  }

  function handleSave() {
    setError(null);
    startTransition(async () => {
      try {
        await updateDispatcherLigneAction(id, code, qtVrac);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Erreur");
      }
    });
  }

  return (
    <>
      <td className="border border-slate-300 bg-white px-2 py-2">
        <input
          type="text"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          className="no-print w-full min-w-[6rem] rounded-lg border border-slate-200 px-2 py-1 text-sm outline-none focus:border-sky-400"
        />
        <span className="print-only">{initialCode}</span>
      </td>
      <td className="border border-slate-300 bg-white px-3 py-3 text-slate-500">
        {initialQtCarton !== null ? Math.round(initialQtCarton).toLocaleString("fr-FR") : ""}
      </td>
      <td className="border border-slate-300 bg-white px-2 py-2">
        <div className="no-print flex items-center gap-1">
          <input
            type="number"
            step="0.01"
            value={qtVrac}
            onChange={(e) => setQtVrac(e.target.value)}
            className="w-20 min-w-0 flex-1 rounded-lg border border-slate-200 px-2 py-1 text-sm outline-none focus:border-sky-400"
          />
          <button
            type="button"
            onClick={handleSave}
            disabled={isPending}
            className="shrink-0 rounded-lg bg-slate-900 px-2 py-1 text-xs font-semibold text-white transition hover:bg-slate-800 disabled:opacity-50"
          >
            {isPending ? "..." : "OK"}
          </button>
        </div>
        <span className="print-only">{initialQtVrac !== null ? initialQtVrac.toLocaleString("fr-FR") : ""}</span>
        {error ? <p className="no-print mt-1 text-xs font-medium text-red-600">{error}</p> : null}
      </td>
    </>
  );
}
