"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteEcritureManuelleAction } from "./actions";

export type EcritureManuelleRow = {
  id: number;
  date_ecriture: string;
  libelle: string;
  piece_reference: string | null;
  created_by: string | null;
  total: number;
};

function formatDate(value: string) {
  const [y, m, d] = value.split("-");
  return `${d}/${m}/${y}`;
}

export function RecentEcrituresList({ ecritures }: { ecritures: EcritureManuelleRow[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [pendingId, setPendingId] = useState<number | null>(null);
  const [errorMessage, setErrorMessage] = useState("");

  function supprimer(id: number) {
    if (!confirm("Supprimer cette ecriture ?")) return;
    setErrorMessage("");
    setPendingId(id);
    startTransition(async () => {
      const result = await deleteEcritureManuelleAction(id);
      if (!result.ok) {
        setErrorMessage(result.message || "Erreur pendant la suppression.");
      }
      setPendingId(null);
      router.refresh();
    });
  }

  if (ecritures.length === 0) {
    return <p className="text-sm text-slate-500">Aucune ecriture saisie manuellement pour le moment.</p>;
  }

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto rounded-xl border border-slate-100">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-slate-50 text-slate-500">
            <tr>
              <th className="px-4 py-2 font-semibold">Date</th>
              <th className="px-4 py-2 font-semibold">Libelle</th>
              <th className="px-4 py-2 font-semibold">Piece</th>
              <th className="px-4 py-2 font-semibold">Cree par</th>
              <th className="px-4 py-2 font-semibold">Total</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody>
            {ecritures.map((ecriture) => (
              <tr key={ecriture.id} className="border-t border-slate-100">
                <td className="px-4 py-2 text-slate-600">{formatDate(ecriture.date_ecriture)}</td>
                <td className="px-4 py-2 font-medium text-slate-900">{ecriture.libelle}</td>
                <td className="px-4 py-2 text-slate-600">{ecriture.piece_reference || "-"}</td>
                <td className="px-4 py-2 text-slate-600">{ecriture.created_by || "-"}</td>
                <td className="px-4 py-2 text-slate-600">
                  {ecriture.total.toLocaleString("fr-FR", { minimumFractionDigits: 2 })} FCFA
                </td>
                <td className="px-4 py-2">
                  <button
                    type="button"
                    onClick={() => supprimer(ecriture.id)}
                    disabled={isPending && pendingId === ecriture.id}
                    className="rounded-full px-3 py-2 text-sm font-semibold text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:text-slate-300"
                  >
                    {isPending && pendingId === ecriture.id ? "..." : "Supprimer"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {errorMessage ? (
        <p className="rounded-2xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">{errorMessage}</p>
      ) : null}
    </div>
  );
}
