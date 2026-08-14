"use client";

import { useRef, useState, useTransition } from "react";

export type AuditColumn = { key: string; label: string; long?: boolean };

export type AuditRow = { id: number | null; [columnKey: string]: string | number | null };

// Meme principe que ProgrammeLigneTable (Programme par ligne) : les valeurs
// des cellules vivent dans une ref (rowsRef), pas dans du useState, pour que
// taper dans un champ ne redeclenche jamais le rendu de tout le tableau -
// seul l'AJOUT/la SUPPRESSION d'une ligne (rowKeys) redessine la table.
// Un seul bouton "Enregistrer" pour toutes les lignes a la fois - jamais un
// bouton par ligne.
export function AuditTable({
  columns,
  initialRows,
  canWrite,
  saveBatchAction,
  deleteRowAction,
}: {
  columns: AuditColumn[];
  initialRows: AuditRow[];
  canWrite: boolean;
  saveBatchAction: (
    rows: AuditRow[]
  ) => Promise<{ ok: boolean; message?: string; insertedIds?: number[] }>;
  deleteRowAction: (id: number) => Promise<void>;
}) {
  const [rowKeys, setRowKeys] = useState<string[]>(() => initialRows.map((r) => `row-${r.id}`));
  const rowsRef = useRef<Record<string, AuditRow>>(
    Object.fromEntries(initialRows.map((r) => [`row-${r.id}`, r]))
  );
  const nextTempId = useRef(-1);
  const [isPending, startTransition] = useTransition();
  const [isDeleting, setIsDeleting] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  function updateCell(key: string, field: string, value: string) {
    rowsRef.current[key] = { ...rowsRef.current[key], [field]: value };
  }

  function addRow() {
    const key = `row-${nextTempId.current--}`;
    const blank: AuditRow = { id: null };
    for (const col of columns) blank[col.key] = "";
    rowsRef.current[key] = blank;
    setRowKeys((prev) => [...prev, key]);
  }

  function removeRow(key: string) {
    const row = rowsRef.current[key];
    if (row?.id) {
      setIsDeleting(key);
      startTransition(async () => {
        try {
          await deleteRowAction(row.id!);
          delete rowsRef.current[key];
          setRowKeys((prev) => prev.filter((k) => k !== key));
        } catch (error) {
          setErrorMessage(error instanceof Error ? error.message : "Erreur pendant la suppression.");
        } finally {
          setIsDeleting(null);
        }
      });
    } else {
      delete rowsRef.current[key];
      setRowKeys((prev) => prev.filter((k) => k !== key));
    }
  }

  function handleSave() {
    setMessage("");
    setErrorMessage("");

    startTransition(async () => {
      try {
        const payload = rowKeys.map((key) => rowsRef.current[key]);
        const result = await saveBatchAction(payload);
        if (!result.ok) {
          setErrorMessage(result.message || "Erreur pendant l'enregistrement.");
          return;
        }
        // Reconcilie les ids des lignes nouvellement inserees (id encore
        // null cote client) avec ceux attribues par la base - sinon un
        // Supprimer juste apres cet Enregistrer prendrait a tort la ligne
        // pour "jamais sauvegardee" et la retirerait seulement de l'ecran,
        // orpheline en base.
        if (result.insertedIds && result.insertedIds.length > 0) {
          let idx = 0;
          for (const key of rowKeys) {
            if (rowsRef.current[key].id === null) {
              rowsRef.current[key] = { ...rowsRef.current[key], id: result.insertedIds[idx] };
              idx++;
            }
          }
        }
        setMessage("Enregistre.");
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : "Erreur pendant l'enregistrement.");
      }
    });
  }

  const cellClass =
    "w-48 rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-500";

  return (
    <div>
      {canWrite ? (
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-4 py-4">
          <button
            type="button"
            onClick={addRow}
            className="rounded-full border border-slate-200 px-5 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-slate-400"
          >
            + Ajouter une ligne
          </button>
          <div className="flex items-center gap-3">
            {message ? <p className="text-sm font-semibold text-emerald-700">{message}</p> : null}
            {errorMessage ? <p className="text-sm font-semibold text-red-700">{errorMessage}</p> : null}
            <button
              type="button"
              onClick={handleSave}
              disabled={isPending}
              className="rounded-full bg-violet-700 px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-violet-600 disabled:opacity-60"
            >
              {isPending ? "Enregistrement..." : "Enregistrer"}
            </button>
          </div>
        </div>
      ) : null}

      <div className="overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-slate-50 text-slate-500">
            <tr>
              {columns.map((col) => (
                <th key={col.key} className="px-4 py-3 font-semibold whitespace-nowrap">
                  {col.label}
                </th>
              ))}
              {canWrite ? <th className="px-4 py-3 font-semibold">Actions</th> : null}
            </tr>
          </thead>
          <tbody>
            {rowKeys.length === 0 ? (
              <tr>
                <td colSpan={columns.length + 1} className="px-4 py-6 text-center text-sm text-slate-500">
                  Aucune ligne pour le moment.
                </td>
              </tr>
            ) : (
              rowKeys.map((key) => {
                const row = rowsRef.current[key];
                return (
                  <tr key={key} className="border-t border-slate-100 align-top">
                    {columns.map((col) =>
                      canWrite ? (
                        <td key={col.key} className="px-4 py-3">
                          {col.long ? (
                            <textarea
                              defaultValue={row[col.key] ?? ""}
                              onChange={(e) => updateCell(key, col.key, e.target.value)}
                              rows={2}
                              className={`${cellClass} min-w-[16rem]`}
                            />
                          ) : (
                            <input
                              type="text"
                              defaultValue={row[col.key] ?? ""}
                              onChange={(e) => updateCell(key, col.key, e.target.value)}
                              className={cellClass}
                            />
                          )}
                        </td>
                      ) : (
                        <td key={col.key} className="px-4 py-3 text-slate-600">
                          {row[col.key] || "-"}
                        </td>
                      )
                    )}
                    {canWrite ? (
                      <td className="px-4 py-3">
                        <button
                          type="button"
                          onClick={() => removeRow(key)}
                          disabled={isDeleting === key}
                          title="Supprimer cette ligne"
                          className="h-9 w-9 rounded-xl border border-red-200 text-sm font-bold text-red-700 transition hover:bg-red-50 disabled:opacity-60"
                        >
                          x
                        </button>
                      </td>
                    ) : null}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {canWrite ? (
        <div className="flex flex-col gap-3 border-t border-slate-100 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            {message ? <p className="text-sm font-semibold text-emerald-700">{message}</p> : null}
            {errorMessage ? <p className="text-sm font-semibold text-red-700">{errorMessage}</p> : null}
          </div>
          <button
            type="button"
            onClick={handleSave}
            disabled={isPending}
            className="rounded-full bg-violet-700 px-6 py-3 text-sm font-semibold text-white transition hover:bg-violet-600 disabled:opacity-60"
          >
            {isPending ? "Enregistrement..." : "Enregistrer"}
          </button>
        </div>
      ) : null}
    </div>
  );
}
