"use client";

import { useState, useTransition } from "react";
import { formatDate } from "@/lib/format-date";
import { FifoCodePicker, type CodeOption } from "./fifo-code-picker";

export type FifoResultRowData = {
  id: number;
  articleId: number;
  articleName: string;
  numeroLot: string;
  dateFabrication: string | null;
  chambre: string | null;
  preparateur: string;
  quantiteChargee: number;
  regleAppliquee: string | null;
};

// Toutes les modifications (code, preparateur, quantite, suppression) ne
// sont que du state local tant que "Enregistrer tout" n'a pas ete clique -
// quitter la page ou juste ne pas cliquer Enregistrer annule tout,
// y compris les suppressions (avant, Supprimer partait immediatement en
// base sans aucun moyen de revenir en arriere).
export function FifoResultsTable({
  commandeId,
  initialRows,
  availableCodesByArticle,
  canEdit,
  saveAction,
}: {
  commandeId: number;
  initialRows: FifoResultRowData[];
  availableCodesByArticle: Record<number, CodeOption[]>;
  canEdit: boolean;
  saveAction: (formData: FormData) => Promise<{ error: string } | void>;
}) {
  const [deletedIds, setDeletedIds] = useState<number[]>([]);
  const [fields, setFields] = useState<
    Record<number, { numeroLot: string; preparateur: string; quantiteChargee: string }>
  >(() =>
    Object.fromEntries(
      initialRows.map((row) => [
        row.id,
        {
          numeroLot: row.numeroLot,
          preparateur: row.preparateur,
          quantiteChargee: String(row.quantiteChargee),
        },
      ])
    )
  );
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

  function updateField(
    id: number,
    key: "numeroLot" | "preparateur" | "quantiteChargee",
    value: string
  ) {
    setFields((current) => ({ ...current, [id]: { ...current[id], [key]: value } }));
  }

  function handleSave() {
    setError("");

    const formData = new FormData();
    formData.set("commande_id", String(commandeId));

    for (const row of initialRows) {
      if (deletedIds.includes(row.id)) continue;
      formData.append("fifo_ids", String(row.id));
      formData.set(`numero_lot_${row.id}`, fields[row.id]?.numeroLot ?? "");
      formData.set(`preparateur_${row.id}`, fields[row.id]?.preparateur ?? "");
      formData.set(`quantite_chargee_${row.id}`, fields[row.id]?.quantiteChargee ?? "");
    }

    for (const id of deletedIds) {
      formData.append("deleted_fifo_ids", String(id));
    }

    startTransition(async () => {
      try {
        const result = await saveAction(formData);
        if (result?.error) {
          setError(result.error);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Erreur inconnue.");
      }
    });
  }

  if (initialRows.length === 0) {
    return (
      <p className="mt-4 rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-800">
        Aucun resultat FIFO encore. Clique sur &quot;Despatcher&quot;.
      </p>
    );
  }

  return (
    <div className="mt-4">
      <div className="overflow-x-auto">
        <table className="min-w-full table-fixed text-left text-sm">
          <colgroup>
            <col className="w-[20%]" />
            <col className="w-[18%]" />
            <col className="w-[11%]" />
            <col className="w-[16%]" />
            <col className="w-[13%]" />
            <col className="w-[12%]" />
            <col className="w-[10%]" />
          </colgroup>
          <thead className="bg-slate-50 text-slate-500">
            <tr>
              <th className="px-4 py-3 font-semibold">Article</th>
              <th className="px-4 py-3 font-semibold">Code (stock &gt; 0)</th>
              <th className="px-4 py-3 font-semibold">Chambre</th>
              <th className="px-4 py-3 font-semibold">Preparateur</th>
              <th className="px-4 py-3 font-semibold">Qt a charger</th>
              <th className="no-print px-4 py-3 font-semibold">Regle FIFO</th>
              <th className="no-print px-4 py-3 font-semibold">Supprimer</th>
            </tr>
          </thead>
          <tbody>
            {initialRows.map((ligne) => {
              const isDeleted = deletedIds.includes(ligne.id);
              const row = fields[ligne.id];

              return (
                <tr
                  key={ligne.id}
                  className={`border-t border-slate-100 ${isDeleted ? "bg-red-50/50 opacity-60" : ""}`}
                >
                  <td className="px-4 py-3 font-medium text-slate-900 align-middle">
                    {ligne.articleName}
                    {isDeleted ? (
                      <p className="text-xs font-semibold text-red-600">
                        A supprimer au prochain Enregistrer
                      </p>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 align-middle">
                    {canEdit && !isDeleted ? (
                      <FifoCodePicker
                        value={row?.numeroLot ?? ""}
                        onChange={(value) => updateField(ligne.id, "numeroLot", value)}
                        codes={availableCodesByArticle[ligne.articleId] ?? []}
                      />
                    ) : (
                      <>
                        <span className="text-slate-700">{ligne.numeroLot || "-"}</span>
                        <p className="text-xs text-slate-500">
                          Date fab. : {formatDate(ligne.dateFabrication)}
                        </p>
                      </>
                    )}
                  </td>
                  <td className="px-4 py-3 text-slate-700 align-middle">{ligne.chambre || "-"}</td>
                  <td className="px-4 py-3 align-middle">
                    {canEdit && !isDeleted ? (
                      <input
                        type="text"
                        value={row?.preparateur ?? ""}
                        onChange={(event) => updateField(ligne.id, "preparateur", event.target.value)}
                        placeholder="Preparateur"
                        className="w-full max-w-[140px] rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none"
                      />
                    ) : (
                      <span className="text-slate-700">{ligne.preparateur || "-"}</span>
                    )}
                  </td>
                  <td className="px-4 py-3 align-middle">
                    {canEdit && !isDeleted ? (
                      <input
                        type="number"
                        min="1"
                        step="1"
                        value={row?.quantiteChargee ?? ""}
                        onChange={(event) =>
                          updateField(ligne.id, "quantiteChargee", event.target.value)
                        }
                        className="w-full max-w-[110px] rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-sky-700 outline-none"
                      />
                    ) : (
                      <span className="font-semibold text-sky-700">{ligne.quantiteChargee}</span>
                    )}
                  </td>
                  <td className="no-print px-4 py-3 text-slate-600 align-middle">
                    {ligne.regleAppliquee || "-"}
                  </td>
                  <td className="no-print px-4 py-3 align-middle">
                    {canEdit ? (
                      isDeleted ? (
                        <button
                          type="button"
                          onClick={() =>
                            setDeletedIds((current) => current.filter((id) => id !== ligne.id))
                          }
                          className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-200"
                        >
                          Annuler
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setDeletedIds((current) => [...current, ligne.id])}
                          aria-label="Supprimer cette ligne du dispatch"
                          title="Supprimer cette ligne du dispatch"
                          className="flex h-9 w-9 items-center justify-center rounded-full border border-red-200 text-red-700 transition hover:bg-red-50"
                        >
                          <svg
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            className="h-4 w-4"
                          >
                            <path d="M3 6h18" />
                            <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                            <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                            <path d="M10 11v6" />
                            <path d="M14 11v6" />
                          </svg>
                        </button>
                      )
                    ) : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {error ? (
        <p className="no-print mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-800">
          {error}
        </p>
      ) : null}

      {canEdit ? (
        <div className="no-print mt-4">
          <button
            type="button"
            onClick={handleSave}
            disabled={isPending}
            className="rounded-full bg-amber-600 px-6 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
          >
            {isPending ? "Enregistrement..." : "Enregistrer tout"}
          </button>
        </div>
      ) : null}
    </div>
  );
}
