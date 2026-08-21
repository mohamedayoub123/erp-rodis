"use client";

import { useRef } from "react";
import { SubmitButton } from "@/app/_components/submit-button";

export type VerifierStockRow = {
  id: number;
  nom: string;
  unite: string;
  besoin: number;
  stock: number;
  disponibleDepotB: number | null;
  disponibleDepotE: number | null;
};

// Tableau "Verifier stock" partage entre Programme par ligne et Programme
// MB - le Besoin est un champ modifiable (pas juste affiche), pour pouvoir
// reduire ce qui sera reellement demande sur les Transfer Order avant de
// les creer. "Deduire le disponible Depot B" remplit chaque champ avec
// max(0, besoin - disponible), en JS pur (pas de re-render serveur) - un
// simple bouton, pas un formulaire a part, pour rester dans le MEME
// <form> que "Creer les Transfer Order" (les valeurs eventuellement
// corrigees a la main doivent partir avec).
export function VerifierStockTable({
  rows,
  errorMessage,
  createAction,
  hiddenFieldName,
  hiddenFieldValue,
  canCreateTransferOrders,
  peutCreerTransferOrders,
}: {
  rows: VerifierStockRow[];
  errorMessage?: string | null;
  createAction: (formData: FormData) => void | Promise<void>;
  hiddenFieldName: string;
  hiddenFieldValue: number;
  canCreateTransferOrders: boolean;
  peutCreerTransferOrders: boolean;
}) {
  const inputRefs = useRef<Record<number, HTMLInputElement | null>>({});

  function deduireDisponible() {
    for (const row of rows) {
      const input = inputRefs.current[row.id];
      if (!input || row.disponibleDepotB === null) continue;
      const nouveauBesoin = Math.max(0, row.besoin - row.disponibleDepotB);
      input.value = String(Math.round(nouveauBesoin * 1000) / 1000);
    }
  }

  return (
    <form action={createAction}>
      <input type="hidden" name={hiddenFieldName} value={hiddenFieldValue} />

      {canCreateTransferOrders && peutCreerTransferOrders ? (
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={deduireDisponible}
            className="rounded-full border border-slate-200 px-5 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-400"
          >
            Deduire le disponible Depot B du besoin
          </button>
          <SubmitButton
            pendingLabel="Creation..."
            className="rounded-full bg-emerald-600 px-5 py-2 text-sm font-semibold text-white transition hover:bg-emerald-500"
          >
            Creer les Transfer Order
          </SubmitButton>
        </div>
      ) : null}

      <section className="overflow-hidden rounded-[1.75rem] border border-black/5 bg-white shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
        {errorMessage ? (
          <div className="px-6 py-8">
            <p className="rounded-2xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">{errorMessage}</p>
          </div>
        ) : rows.length === 0 ? (
          <div className="px-6 py-8 text-sm text-slate-500">Aucune recette trouvee pour les articles de ce programme.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="sticky top-0 z-10 bg-slate-50 text-slate-500">
                <tr>
                  <th className="px-6 py-4 font-semibold">Article MP</th>
                  <th className="px-6 py-4 font-semibold">Unite</th>
                  <th className="px-6 py-4 font-semibold">Besoin</th>
                  <th className="px-6 py-4 font-semibold">Stock actuel</th>
                  <th className="px-6 py-4 font-semibold">Disponible Depot E (non reserve)</th>
                  <th className="px-6 py-4 font-semibold">Disponible Depot B (non reserve)</th>
                  <th className="px-6 py-4 font-semibold"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const insuffisant = row.besoin > row.stock;
                  return (
                    <tr key={row.id} className="border-t border-slate-100">
                      <td className="px-6 py-4 font-medium text-slate-900">{row.nom}</td>
                      <td className="px-6 py-4 text-slate-600">{row.unite}</td>
                      <td className="px-6 py-4">
                        {canCreateTransferOrders && peutCreerTransferOrders ? (
                          <input
                            type="number"
                            step="0.001"
                            min="0"
                            name={`besoin_override_${row.id}`}
                            defaultValue={row.besoin}
                            ref={(el) => {
                              inputRefs.current[row.id] = el;
                            }}
                            className="w-32 rounded-2xl border border-slate-200 px-3 py-2 text-sm outline-none"
                          />
                        ) : (
                          row.besoin.toLocaleString("fr-FR", { maximumFractionDigits: 3 })
                        )}
                      </td>
                      <td className="px-6 py-4 text-slate-600">
                        {row.stock.toLocaleString("fr-FR", { maximumFractionDigits: 3 })}
                      </td>
                      <td className="px-6 py-4 text-slate-600">
                        {row.disponibleDepotE === null
                          ? "-"
                          : row.disponibleDepotE.toLocaleString("fr-FR", { maximumFractionDigits: 3 })}
                      </td>
                      <td className="px-6 py-4 text-slate-600">
                        {row.disponibleDepotB === null
                          ? "-"
                          : row.disponibleDepotB.toLocaleString("fr-FR", { maximumFractionDigits: 3 })}
                      </td>
                      <td className="px-6 py-4">
                        {insuffisant ? (
                          <span className="rounded-full bg-red-50 px-3 py-1 text-xs font-semibold text-red-700">
                            Insuffisant
                          </span>
                        ) : (
                          <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
                            OK
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </form>
  );
}
