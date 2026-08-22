"use client";

import { useState, useTransition } from "react";
import { formatDate } from "@/lib/format-date";
import { deletePaiementFournisseurAction, enregistrerPaiementFournisseurAction } from "./actions";

type Paiement = {
  id: number;
  montant: number;
  compteCode: string;
  datePaiement: string;
  reference: string | null;
};

function compteLabel(compteCode: string) {
  if (compteCode === "521000") return "Banque";
  if (compteCode === "571000") return "Caisse";
  return compteCode;
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

// Paiements faits A un fournisseur - fait redescendre le compte 401000
// (Fournisseurs) via enregistrerPaiementFournisseurAction (./actions.ts).
// Meme idiome que PaiementsSection (app/commandes/[id]/paiements-section.tsx),
// dans l'autre sens : FormData construite a la main + useTransition + try/catch
// pour l'ajout (enregistrerPaiementFournisseurAction leve une Error simple et
// ne renvoie rien en cas de succes), form action natif pour la suppression.
export function PaiementsFournisseur({
  fournisseurId,
  paiements,
  montantAchete,
  canEdit,
}: {
  fournisseurId: number;
  paiements: Paiement[];
  montantAchete: number;
  canEdit: boolean;
}) {
  const [montant, setMontant] = useState("");
  const [compteCode, setCompteCode] = useState("521000");
  const [datePaiement, setDatePaiement] = useState(todayIso);
  const [reference, setReference] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [isPending, startTransition] = useTransition();

  const totalPaye = paiements.reduce((sum, p) => sum + Number(p.montant || 0), 0);
  const restant = montantAchete - totalPaye;

  function handleSubmit() {
    const montantValue = Number(montant.replace(",", "."));
    if (!montantValue || montantValue <= 0) {
      setError("Montant invalide.");
      setSuccess("");
      return;
    }
    if (compteCode !== "521000" && compteCode !== "571000") {
      setError("Compte invalide - choisis Banque ou Caisse.");
      setSuccess("");
      return;
    }
    setError("");

    const formData = new FormData();
    formData.set("fournisseur_id", String(fournisseurId));
    formData.set("montant", String(montantValue));
    formData.set("compte_code", compteCode);
    formData.set("date_paiement", datePaiement || todayIso());
    formData.set("reference", reference);

    startTransition(async () => {
      try {
        await enregistrerPaiementFournisseurAction(formData);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Erreur inconnue.");
        setSuccess("");
        return;
      }
      setMontant("");
      setCompteCode("521000");
      setDatePaiement(todayIso());
      setReference("");
      setSuccess("Paiement enregistre.");
    });
  }

  return (
    <div className="mt-4">
      <div className="rounded-2xl bg-slate-50 px-4 py-3 text-sm font-medium text-slate-700">
        Achete : {montantAchete.toLocaleString("fr-FR", { maximumFractionDigits: 0 })} FCFA
        {" — "}
        Paye : {totalPaye.toLocaleString("fr-FR", { maximumFractionDigits: 0 })} FCFA
        {" — "}
        Reste :{" "}
        <span className={restant > 0 ? "font-semibold text-red-600" : "font-semibold text-emerald-700"}>
          {restant.toLocaleString("fr-FR", { maximumFractionDigits: 0 })} FCFA
        </span>
      </div>

      {paiements.length > 0 ? (
        <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-50 text-slate-500">
              <tr>
                <th className="px-4 py-2 font-semibold">Date</th>
                <th className="px-4 py-2 font-semibold">Montant</th>
                <th className="px-4 py-2 font-semibold">Compte</th>
                <th className="px-4 py-2 font-semibold">Reference</th>
                {canEdit ? <th className="px-4 py-2 font-semibold">Action</th> : null}
              </tr>
            </thead>
            <tbody>
              {paiements.map((paiement) => (
                <tr key={paiement.id} className="border-t border-slate-200">
                  <td className="px-4 py-2 text-slate-700">{formatDate(paiement.datePaiement)}</td>
                  <td className="px-4 py-2 font-semibold text-slate-900">
                    {paiement.montant.toLocaleString("fr-FR", { maximumFractionDigits: 0 })} FCFA
                  </td>
                  <td className="px-4 py-2 text-slate-700">{compteLabel(paiement.compteCode)}</td>
                  <td className="px-4 py-2 text-slate-700">{paiement.reference || "-"}</td>
                  {canEdit ? (
                    <td className="px-4 py-2">
                      <form action={deletePaiementFournisseurAction}>
                        <input type="hidden" name="paiement_id" value={paiement.id} />
                        <button
                          type="submit"
                          onClick={(event) => {
                            if (!window.confirm("Supprimer ce paiement ? Cette action est definitive.")) {
                              event.preventDefault();
                            }
                          }}
                          className="rounded-full border border-red-200 px-3 py-1 text-xs font-semibold text-red-700 transition hover:bg-red-50"
                        >
                          Supprimer
                        </button>
                      </form>
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="mt-4 text-sm text-slate-500">Aucun paiement enregistre pour ce fournisseur.</p>
      )}

      {canEdit ? (
        <div className="mt-5 rounded-2xl border border-slate-200 bg-white p-4">
          <p className="text-sm font-semibold text-slate-800">Enregistrer un paiement</p>

          <div className="mt-3 grid gap-4 sm:grid-cols-4">
            <label className="grid gap-1 text-xs font-semibold text-slate-500">
              Montant
              <input
                type="number"
                min="0.01"
                step="0.01"
                value={montant}
                onChange={(event) => setMontant(event.target.value)}
                className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-900 outline-none"
              />
            </label>

            <label className="grid gap-1 text-xs font-semibold text-slate-500">
              Compte
              <select
                value={compteCode}
                onChange={(event) => setCompteCode(event.target.value)}
                className="rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none"
              >
                <option value="521000">Banque</option>
                <option value="571000">Caisse</option>
              </select>
            </label>

            <label className="grid gap-1 text-xs font-semibold text-slate-500">
              Date
              <input
                type="date"
                value={datePaiement}
                onChange={(event) => setDatePaiement(event.target.value)}
                className="rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none"
              />
            </label>

            <label className="grid gap-1 text-xs font-semibold text-slate-500">
              Reference (optionnel)
              <input
                type="text"
                value={reference}
                onChange={(event) => setReference(event.target.value)}
                placeholder="Reference"
                className="rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none"
              />
            </label>
          </div>

          {error ? (
            <p className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">{error}</p>
          ) : null}
          {success ? (
            <p className="mt-3 rounded-xl bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700">
              {success}
            </p>
          ) : null}

          <div className="mt-3">
            <button
              type="button"
              onClick={handleSubmit}
              disabled={isPending}
              className="rounded-full bg-amber-600 px-6 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
            >
              {isPending ? "Enregistrement..." : "Enregistrer le paiement"}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
