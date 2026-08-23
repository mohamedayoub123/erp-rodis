"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  annulerAmortissementMoisAction,
  genererAmortissementMoisAction,
  updateImmobilisationStatutAction,
} from "./actions";

export type AmortissementMois = { periode: string; montant: number };

export type ImmoRowData = {
  id: number;
  nom: string;
  categorie: string | null;
  dateAcquisition: string;
  valeurAcquisition: number;
  dureeAmortissementMois: number;
  statut: string;
  amortissements: AmortissementMois[];
};

function moisActuel() {
  return new Date().toISOString().slice(0, 7);
}

export function ImmoRow({ immo, canWrite }: { immo: ImmoRowData; canWrite: boolean }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [periode, setPeriode] = useState(moisActuel);
  const [message, setMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [ouvert, setOuvert] = useState(false);

  const totalAmorti = immo.amortissements.reduce((sum, a) => sum + a.montant, 0);
  const valeurNette = Math.max(0, immo.valeurAcquisition - totalAmorti);
  const completementAmorti = valeurNette <= 0.01;
  const dejaAmortiPourPeriode = immo.amortissements.some((a) => a.periode === periode);

  function generer() {
    setMessage("");
    setErrorMessage("");
    const formData = new FormData();
    formData.set("immo_id", String(immo.id));
    formData.set("periode", periode);

    startTransition(async () => {
      const result = await genererAmortissementMoisAction(formData);
      if (!result.ok) {
        setErrorMessage(result.message || "Erreur pendant la generation.");
        return;
      }
      setMessage(`Amortissement genere pour ${periode}.`);
      router.refresh();
    });
  }

  function annuler(periodeAAnnuler: string) {
    if (!confirm(`Annuler l'amortissement de ${immo.nom} pour ${periodeAAnnuler} ?`)) return;
    startTransition(async () => {
      const result = await annulerAmortissementMoisAction(immo.id, periodeAAnnuler);
      if (!result.ok) {
        setErrorMessage(result.message || "Erreur pendant l'annulation.");
        return;
      }
      router.refresh();
    });
  }

  function toggleStatut() {
    startTransition(async () => {
      await updateImmobilisationStatutAction(immo.id, immo.statut === "actif" ? "cede" : "actif");
      router.refresh();
    });
  }

  return (
    <div className="rounded-2xl border border-slate-100 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-semibold text-slate-900">
            {immo.nom}
            {immo.statut !== "actif" ? <span className="ml-2 text-xs font-normal text-slate-400">(cede)</span> : null}
            {completementAmorti ? (
              <span className="ml-2 text-xs font-normal text-emerald-600">(completement amorti)</span>
            ) : null}
          </p>
          <p className="text-xs text-slate-500">
            {immo.categorie || "-"} - acquis le {immo.dateAcquisition} pour{" "}
            {immo.valeurAcquisition.toLocaleString("fr-FR")} FCFA - amorti sur {immo.dureeAmortissementMois} mois
          </p>
          <p className="mt-1 text-xs font-semibold text-slate-700">
            Valeur nette comptable : {valeurNette.toLocaleString("fr-FR", { maximumFractionDigits: 0 })} FCFA (
            {immo.amortissements.length}/{immo.dureeAmortissementMois} mois amortis)
          </p>
        </div>
        <div className="flex items-center gap-2">
          {canWrite ? (
            <button
              type="button"
              onClick={toggleStatut}
              disabled={isPending}
              className="rounded-full border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
            >
              {immo.statut === "actif" ? "Marquer cede" : "Reactiver"}
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => setOuvert((v) => !v)}
            className="rounded-full border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
          >
            {ouvert ? "Fermer" : "Voir les amortissements"}
          </button>
        </div>
      </div>

      {ouvert ? (
        <div className="mt-4 space-y-3 border-t border-slate-100 pt-4">
          {immo.amortissements.length > 0 ? (
            <div className="overflow-x-auto rounded-xl border border-slate-100">
              <table className="min-w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-500">
                  <tr>
                    <th className="px-3 py-2 font-semibold">Mois</th>
                    <th className="px-3 py-2 font-semibold">Dotation</th>
                    {canWrite ? <th className="px-3 py-2" /> : null}
                  </tr>
                </thead>
                <tbody>
                  {immo.amortissements.map((a) => (
                    <tr key={a.periode} className="border-t border-slate-100">
                      <td className="px-3 py-2 text-slate-700">{a.periode}</td>
                      <td className="px-3 py-2 font-semibold text-slate-900">
                        {a.montant.toLocaleString("fr-FR", { maximumFractionDigits: 0 })} FCFA
                      </td>
                      {canWrite ? (
                        <td className="px-3 py-2">
                          <button type="button" onClick={() => annuler(a.periode)} className="text-red-600 hover:underline">
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
            <p className="text-xs text-slate-500">Aucun amortissement genere.</p>
          )}

          {canWrite && !completementAmorti ? (
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
              <button
                type="button"
                onClick={generer}
                disabled={isPending || dejaAmortiPourPeriode}
                className={`rounded-full px-5 py-2.5 text-sm font-semibold text-white ${
                  isPending || dejaAmortiPourPeriode ? "cursor-not-allowed bg-slate-300" : "bg-amber-700 hover:bg-amber-600"
                }`}
              >
                {dejaAmortiPourPeriode ? "Deja amorti ce mois" : isPending ? "..." : "Generer la dotation du mois"}
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
