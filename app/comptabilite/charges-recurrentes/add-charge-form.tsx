"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CATEGORIES_CHARGE, createChargeRecurrenteAction } from "./actions";
import { CompteSearch, type CompteOption } from "../ecriture-manuelle/compte-search";

export function AddChargeForm({ comptes }: { comptes: CompteOption[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [nom, setNom] = useState("");
  const [categorie, setCategorie] = useState<string>(CATEGORIES_CHARGE[0]);
  const [montant, setMontant] = useState("");
  const [compteCharge, setCompteCharge] = useState("");
  const [compteContrepartie, setCompteContrepartie] = useState("571000");
  const [message, setMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  function save() {
    setMessage("");
    setErrorMessage("");
    if (!nom.trim()) {
      setErrorMessage("Le nom est obligatoire.");
      return;
    }
    if (!compteCharge) {
      setErrorMessage("Choisis le compte de charge.");
      return;
    }
    const formData = new FormData();
    formData.set("nom", nom.trim());
    formData.set("categorie", categorie);
    formData.set("montant", montant);
    formData.set("compte_charge_code", compteCharge);
    formData.set("compte_contrepartie_code", compteContrepartie);

    startTransition(async () => {
      const result = await createChargeRecurrenteAction(formData);
      if (!result.ok) {
        setErrorMessage(result.message || "Erreur pendant l'enregistrement.");
        return;
      }
      setNom("");
      setMontant("");
      setCompteCharge("");
      setMessage("Charge ajoutee.");
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="grid gap-1 text-xs font-semibold text-slate-500">
          Nom
          <input
            type="text"
            value={nom}
            onChange={(event) => setNom(event.target.value)}
            placeholder="Ex: Loyer entrepot"
            className="rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-900 outline-none"
          />
        </label>
        <label className="grid gap-1 text-xs font-semibold text-slate-500">
          Categorie
          <select
            value={categorie}
            onChange={(event) => setCategorie(event.target.value)}
            className="rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-900 outline-none"
          >
            {CATEGORIES_CHARGE.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-xs font-semibold text-slate-500">
          Montant mensuel (FCFA)
          <input
            type="number"
            step="0.01"
            value={montant}
            onChange={(event) => setMontant(event.target.value)}
            className="rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-900 outline-none"
          />
        </label>
        <label className="grid gap-1 text-xs font-semibold text-slate-500">
          Compte de charge (debite a chaque reglement)
          <CompteSearch comptes={comptes} value={compteCharge} onChange={setCompteCharge} />
        </label>
        <label className="grid gap-1 text-xs font-semibold text-slate-500">
          Compte de contrepartie (Banque/Caisse, credite)
          <CompteSearch comptes={comptes} value={compteContrepartie} onChange={setCompteContrepartie} />
        </label>
      </div>

      {errorMessage ? (
        <p className="rounded-2xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">{errorMessage}</p>
      ) : null}
      {message ? (
        <p className="rounded-2xl bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">{message}</p>
      ) : null}

      <button
        type="button"
        onClick={save}
        disabled={isPending}
        className={`rounded-full px-6 py-3 text-sm font-semibold text-white ${
          isPending ? "cursor-not-allowed bg-slate-300" : "bg-amber-700 transition hover:bg-amber-600"
        }`}
      >
        {isPending ? "Enregistrement..." : "Ajouter la charge"}
      </button>
    </div>
  );
}
