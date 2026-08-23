"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { annulerPaiementEmployeAction, payerEmployeAction, updateEmployeActifAction } from "./actions";

export type PaiementMois = { periode: string; montant: number };

export type EmployeRowData = {
  id: number;
  nom: string;
  poste: string | null;
  salaireMensuel: number;
  actif: boolean;
  paiements: PaiementMois[];
};

function moisActuel() {
  return new Date().toISOString().slice(0, 7);
}

export function EmployeRow({ employe, canWrite }: { employe: EmployeRowData; canWrite: boolean }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [periode, setPeriode] = useState(moisActuel);
  const [montant, setMontant] = useState(String(employe.salaireMensuel));
  const [message, setMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [ouvert, setOuvert] = useState(false);

  const dejaPayePourPeriode = employe.paiements.some((p) => p.periode === periode);

  function payer() {
    setMessage("");
    setErrorMessage("");
    const formData = new FormData();
    formData.set("employe_id", String(employe.id));
    formData.set("periode", periode);
    formData.set("montant", montant);

    startTransition(async () => {
      const result = await payerEmployeAction(formData);
      if (!result.ok) {
        setErrorMessage(result.message || "Erreur pendant le paiement.");
        return;
      }
      setMessage(`Paye pour ${periode}.`);
      router.refresh();
    });
  }

  function annuler(periodeAAnnuler: string) {
    if (!confirm(`Annuler le paiement de ${employe.nom} pour ${periodeAAnnuler} ?`)) return;
    startTransition(async () => {
      const result = await annulerPaiementEmployeAction(employe.id, periodeAAnnuler);
      if (!result.ok) {
        setErrorMessage(result.message || "Erreur pendant l'annulation.");
        return;
      }
      router.refresh();
    });
  }

  function toggleActif() {
    startTransition(async () => {
      await updateEmployeActifAction(employe.id, !employe.actif);
      router.refresh();
    });
  }

  return (
    <div className="rounded-2xl border border-slate-100 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-semibold text-slate-900">
            {employe.nom} {!employe.actif ? <span className="ml-2 text-xs font-normal text-slate-400">(inactif)</span> : null}
          </p>
          <p className="text-xs text-slate-500">
            {employe.poste || "-"} - {employe.salaireMensuel.toLocaleString("fr-FR")} FCFA/mois
          </p>
        </div>
        <div className="flex items-center gap-2">
          {canWrite ? (
            <button
              type="button"
              onClick={toggleActif}
              disabled={isPending}
              className="rounded-full border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
            >
              {employe.actif ? "Marquer inactif" : "Reactiver"}
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => setOuvert((v) => !v)}
            className="rounded-full border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
          >
            {ouvert ? "Fermer" : "Voir les paiements"}
          </button>
        </div>
      </div>

      {ouvert ? (
        <div className="mt-4 space-y-3 border-t border-slate-100 pt-4">
          {employe.paiements.length > 0 ? (
            <div className="overflow-x-auto rounded-xl border border-slate-100">
              <table className="min-w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-500">
                  <tr>
                    <th className="px-3 py-2 font-semibold">Mois</th>
                    <th className="px-3 py-2 font-semibold">Montant</th>
                    {canWrite ? <th className="px-3 py-2" /> : null}
                  </tr>
                </thead>
                <tbody>
                  {employe.paiements.map((p) => (
                    <tr key={p.periode} className="border-t border-slate-100">
                      <td className="px-3 py-2 text-slate-700">{p.periode}</td>
                      <td className="px-3 py-2 font-semibold text-slate-900">
                        {p.montant.toLocaleString("fr-FR")} FCFA
                      </td>
                      {canWrite ? (
                        <td className="px-3 py-2">
                          <button
                            type="button"
                            onClick={() => annuler(p.periode)}
                            className="text-red-600 hover:underline"
                          >
                            Annuler
                          </button>
                        </td>
                      ) : null}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-xs text-slate-500">Aucun paiement enregistre.</p>
          )}

          {canWrite ? (
            <div className="flex flex-wrap items-end gap-3">
              <label className="grid gap-1 text-xs font-semibold text-slate-500">
                Mois
                <input
                  type="month"
                  value={periode}
                  onChange={(event) => setPeriode(event.target.value)}
                  className="rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none"
                />
              </label>
              <label className="grid gap-1 text-xs font-semibold text-slate-500">
                Montant
                <input
                  type="number"
                  step="0.01"
                  value={montant}
                  onChange={(event) => setMontant(event.target.value)}
                  className="w-32 rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none"
                />
              </label>
              <button
                type="button"
                onClick={payer}
                disabled={isPending || dejaPayePourPeriode}
                className={`rounded-full px-5 py-2.5 text-sm font-semibold text-white ${
                  isPending || dejaPayePourPeriode ? "cursor-not-allowed bg-slate-300" : "bg-amber-700 hover:bg-amber-600"
                }`}
              >
                {dejaPayePourPeriode ? "Deja paye ce mois" : isPending ? "..." : "Payer ce mois"}
              </button>
            </div>
          ) : null}

          {errorMessage ? <p className="text-xs font-semibold text-red-700">{errorMessage}</p> : null}
          {message ? <p className="text-xs font-semibold text-emerald-700">{message}</p> : null}
        </div>
      ) : null}
    </div>
  );
}
