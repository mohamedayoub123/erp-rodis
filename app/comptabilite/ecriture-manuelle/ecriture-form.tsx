"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { creerEcritureManuelleAction } from "./actions";
import { CompteSearch, type CompteOption } from "./compte-search";

type Ligne = { id: number; compteCode: string; debit: string; credit: string };

function ligneVide(id: number): Ligne {
  return { id, compteCode: "", debit: "", credit: "" };
}

function toNumber(value: string) {
  const n = Number(value.replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

export function EcritureManuelleForm({ comptes }: { comptes: CompteOption[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [dateEcriture, setDateEcriture] = useState(() => new Date().toISOString().slice(0, 10));
  const [libelle, setLibelle] = useState("");
  const [pieceReference, setPieceReference] = useState("");
  const [lignes, setLignes] = useState<Ligne[]>(() => [ligneVide(1), ligneVide(2)]);
  const [nextId, setNextId] = useState(3);
  const [message, setMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  const totalDebit = useMemo(() => lignes.reduce((sum, l) => sum + toNumber(l.debit), 0), [lignes]);
  const totalCredit = useMemo(() => lignes.reduce((sum, l) => sum + toNumber(l.credit), 0), [lignes]);
  const equilibree = Math.abs(totalDebit - totalCredit) < 0.01 && totalDebit > 0;

  function ajouterLigne() {
    setLignes((current) => [...current, ligneVide(nextId)]);
    setNextId((id) => id + 1);
  }

  function supprimerLigne(id: number) {
    setLignes((current) => (current.length > 2 ? current.filter((l) => l.id !== id) : current));
  }

  function modifierLigne(id: number, patch: Partial<Ligne>) {
    setLignes((current) => current.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  }

  function reinitialiser() {
    setLibelle("");
    setPieceReference("");
    setLignes([ligneVide(nextId), ligneVide(nextId + 1)]);
    setNextId((id) => id + 2);
  }

  function save() {
    setMessage("");
    setErrorMessage("");

    if (!dateEcriture) {
      setErrorMessage("La date est obligatoire.");
      return;
    }
    if (!libelle.trim()) {
      setErrorMessage("Le libelle est obligatoire.");
      return;
    }
    if (!equilibree) {
      setErrorMessage("Le total debit doit etre egal au total credit avant d'enregistrer.");
      return;
    }

    const lignesValides = lignes
      .filter((l) => l.compteCode && (toNumber(l.debit) > 0 || toNumber(l.credit) > 0))
      .map((l) => ({ compteCode: l.compteCode, debit: toNumber(l.debit), credit: toNumber(l.credit) }));

    const formData = new FormData();
    formData.set("date_ecriture", dateEcriture);
    formData.set("libelle", libelle.trim());
    formData.set("piece_reference", pieceReference.trim());
    formData.set("lignes", JSON.stringify(lignesValides));

    startTransition(async () => {
      const result = await creerEcritureManuelleAction(formData);
      if (!result.ok) {
        setErrorMessage(result.message || "Erreur pendant l'enregistrement.");
        return;
      }
      setMessage("Ecriture enregistree.");
      reinitialiser();
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <label className="grid gap-1 text-xs font-semibold text-slate-500">
          Date
          <input
            type="date"
            value={dateEcriture}
            onChange={(event) => setDateEcriture(event.target.value)}
            className="rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-900 outline-none"
          />
        </label>
        <label className="grid gap-1 text-xs font-semibold text-slate-500 sm:col-span-2">
          Libelle
          <input
            type="text"
            value={libelle}
            onChange={(event) => setLibelle(event.target.value)}
            placeholder="Ex: Regularisation charge locative aout 2026"
            className="rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-900 outline-none"
          />
        </label>
        <label className="grid gap-1 text-xs font-semibold text-slate-500 sm:col-span-3">
          Reference piece (optionnel)
          <input
            type="text"
            value={pieceReference}
            onChange={(event) => setPieceReference(event.target.value)}
            placeholder="Ex: Facture n°..."
            className="rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-900 outline-none"
          />
        </label>
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-100">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-slate-50 text-slate-500">
            <tr>
              <th className="px-4 py-2 font-semibold">Compte</th>
              <th className="px-4 py-2 font-semibold">Debit</th>
              <th className="px-4 py-2 font-semibold">Credit</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody>
            {lignes.map((ligne) => (
              <tr key={ligne.id} className="border-t border-slate-100 align-top">
                <td className="min-w-[16rem] px-4 py-2">
                  <CompteSearch
                    comptes={comptes}
                    value={ligne.compteCode}
                    onChange={(code) => modifierLigne(ligne.id, { compteCode: code })}
                  />
                </td>
                <td className="px-4 py-2">
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={ligne.debit}
                    onChange={(event) => modifierLigne(ligne.id, { debit: event.target.value, credit: "" })}
                    className="w-32 rounded-2xl border border-slate-200 px-3 py-3 text-sm text-slate-900 outline-none"
                  />
                </td>
                <td className="px-4 py-2">
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={ligne.credit}
                    onChange={(event) => modifierLigne(ligne.id, { credit: event.target.value, debit: "" })}
                    className="w-32 rounded-2xl border border-slate-200 px-3 py-3 text-sm text-slate-900 outline-none"
                  />
                </td>
                <td className="px-4 py-2">
                  <button
                    type="button"
                    onClick={() => supprimerLigne(ligne.id)}
                    disabled={lignes.length <= 2}
                    className="rounded-full px-3 py-2 text-sm font-semibold text-red-600 disabled:cursor-not-allowed disabled:text-slate-300"
                  >
                    Retirer
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-slate-200 bg-slate-50 font-semibold text-slate-900">
              <td className="px-4 py-2">Total</td>
              <td className="px-4 py-2">{totalDebit.toLocaleString("fr-FR", { minimumFractionDigits: 2 })}</td>
              <td className="px-4 py-2">{totalCredit.toLocaleString("fr-FR", { minimumFractionDigits: 2 })}</td>
              <td className="px-4 py-2" />
            </tr>
          </tfoot>
        </table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          onClick={ajouterLigne}
          className="rounded-full border border-slate-200 px-5 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
        >
          + Ajouter une ligne
        </button>

        <div className="flex items-center gap-3">
          <span
            className={`rounded-full px-4 py-2 text-sm font-semibold ${
              equilibree ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"
            }`}
          >
            {equilibree ? "Equilibree" : "Debit != Credit"}
          </span>
          <button
            type="button"
            onClick={save}
            disabled={isPending || !equilibree}
            className={`rounded-full px-6 py-3 text-sm font-semibold text-white ${
              isPending || !equilibree ? "cursor-not-allowed bg-slate-300" : "bg-amber-700 transition hover:bg-amber-600"
            }`}
          >
            {isPending ? "Enregistrement..." : "Enregistrer l'ecriture"}
          </button>
        </div>
      </div>

      {errorMessage ? (
        <p className="rounded-2xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">{errorMessage}</p>
      ) : null}
      {message ? (
        <p className="rounded-2xl bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">{message}</p>
      ) : null}
    </div>
  );
}
