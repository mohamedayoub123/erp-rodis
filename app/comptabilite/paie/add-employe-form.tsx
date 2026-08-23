"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createEmployeAction } from "./actions";
import { CompteSearch, type CompteOption } from "../ecriture-manuelle/compte-search";

export function AddEmployeForm({ comptes }: { comptes: CompteOption[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [nom, setNom] = useState("");
  const [poste, setPoste] = useState("");
  const [salaireMensuel, setSalaireMensuel] = useState("");
  const [compteCharge, setCompteCharge] = useState("66100000");
  const [compteContrepartie, setCompteContrepartie] = useState("571000");
  const [dateEmbauche, setDateEmbauche] = useState("");
  const [message, setMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  function save() {
    setMessage("");
    setErrorMessage("");
    if (!nom.trim()) {
      setErrorMessage("Le nom est obligatoire.");
      return;
    }
    const formData = new FormData();
    formData.set("nom", nom.trim());
    formData.set("poste", poste.trim());
    formData.set("salaire_mensuel", salaireMensuel);
    formData.set("compte_charge_code", compteCharge);
    formData.set("compte_contrepartie_code", compteContrepartie);
    formData.set("date_embauche", dateEmbauche);

    startTransition(async () => {
      const result = await createEmployeAction(formData);
      if (!result.ok) {
        setErrorMessage(result.message || "Erreur pendant l'enregistrement.");
        return;
      }
      setNom("");
      setPoste("");
      setSalaireMensuel("");
      setDateEmbauche("");
      setMessage("Employe ajoute.");
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
            className="rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-900 outline-none"
          />
        </label>
        <label className="grid gap-1 text-xs font-semibold text-slate-500">
          Poste (optionnel)
          <input
            type="text"
            value={poste}
            onChange={(event) => setPoste(event.target.value)}
            className="rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-900 outline-none"
          />
        </label>
        <label className="grid gap-1 text-xs font-semibold text-slate-500">
          Salaire mensuel (FCFA)
          <input
            type="number"
            step="0.01"
            value={salaireMensuel}
            onChange={(event) => setSalaireMensuel(event.target.value)}
            className="rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-900 outline-none"
          />
        </label>
        <label className="grid gap-1 text-xs font-semibold text-slate-500">
          Date d&apos;embauche (optionnel)
          <input
            type="date"
            value={dateEmbauche}
            onChange={(event) => setDateEmbauche(event.target.value)}
            className="rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-900 outline-none"
          />
        </label>
        <label className="grid gap-1 text-xs font-semibold text-slate-500">
          Compte de charge (debite a chaque paiement)
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
        {isPending ? "Enregistrement..." : "Ajouter l'employe"}
      </button>
    </div>
  );
}
