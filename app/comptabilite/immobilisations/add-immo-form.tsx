"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createImmobilisationAction } from "./actions";
import { CompteSearch, type CompteOption } from "../ecriture-manuelle/compte-search";

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export function AddImmoForm({ comptes }: { comptes: CompteOption[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [nom, setNom] = useState("");
  const [categorie, setCategorie] = useState("");
  const [dateAcquisition, setDateAcquisition] = useState(todayIso);
  const [valeurAcquisition, setValeurAcquisition] = useState("");
  const [dureeAmortissementMois, setDureeAmortissementMois] = useState("60");
  const [compteImmobilisation, setCompteImmobilisation] = useState("");
  const [compteAmortissement, setCompteAmortissement] = useState("");
  const [compteDotation, setCompteDotation] = useState("68120000");
  const [compteContrepartie, setCompteContrepartie] = useState("571000");
  const [message, setMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  function save() {
    setMessage("");
    setErrorMessage("");
    if (!nom.trim()) return setErrorMessage("Le nom est obligatoire.");
    if (!compteImmobilisation) return setErrorMessage("Choisis le compte d'immobilisation (classe 2).");
    if (!compteAmortissement) return setErrorMessage("Choisis le compte d'amortissement (classe 28).");

    const formData = new FormData();
    formData.set("nom", nom.trim());
    formData.set("categorie", categorie.trim());
    formData.set("date_acquisition", dateAcquisition);
    formData.set("valeur_acquisition", valeurAcquisition);
    formData.set("duree_amortissement_mois", dureeAmortissementMois);
    formData.set("compte_immobilisation_code", compteImmobilisation);
    formData.set("compte_amortissement_code", compteAmortissement);
    formData.set("compte_dotation_code", compteDotation);
    formData.set("compte_contrepartie_code", compteContrepartie);

    startTransition(async () => {
      const result = await createImmobilisationAction(formData);
      if (!result.ok) {
        setErrorMessage(result.message || "Erreur pendant l'enregistrement.");
        return;
      }
      setNom("");
      setCategorie("");
      setValeurAcquisition("");
      setCompteImmobilisation("");
      setCompteAmortissement("");
      setMessage("Immobilisation ajoutee - ecriture d'acquisition enregistree.");
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
            placeholder="Ex: Machine de conditionnement chaine 3"
            className="rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-900 outline-none"
          />
        </label>
        <label className="grid gap-1 text-xs font-semibold text-slate-500">
          Categorie (optionnel)
          <input
            type="text"
            value={categorie}
            onChange={(event) => setCategorie(event.target.value)}
            className="rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-900 outline-none"
          />
        </label>
        <label className="grid gap-1 text-xs font-semibold text-slate-500">
          Date d&apos;acquisition
          <input
            type="date"
            value={dateAcquisition}
            onChange={(event) => setDateAcquisition(event.target.value)}
            className="rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-900 outline-none"
          />
        </label>
        <label className="grid gap-1 text-xs font-semibold text-slate-500">
          Valeur d&apos;acquisition (FCFA)
          <input
            type="number"
            step="0.01"
            value={valeurAcquisition}
            onChange={(event) => setValeurAcquisition(event.target.value)}
            className="rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-900 outline-none"
          />
        </label>
        <label className="grid gap-1 text-xs font-semibold text-slate-500">
          Duree d&apos;amortissement (mois)
          <input
            type="number"
            step="1"
            value={dureeAmortissementMois}
            onChange={(event) => setDureeAmortissementMois(event.target.value)}
            className="rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-900 outline-none"
          />
        </label>
        <label className="grid gap-1 text-xs font-semibold text-slate-500">
          Compte d&apos;immobilisation (classe 2, debite a l&apos;achat)
          <CompteSearch comptes={comptes} value={compteImmobilisation} onChange={setCompteImmobilisation} />
        </label>
        <label className="grid gap-1 text-xs font-semibold text-slate-500">
          Compte d&apos;amortissement (classe 28, credite chaque mois)
          <CompteSearch comptes={comptes} value={compteAmortissement} onChange={setCompteAmortissement} />
        </label>
        <label className="grid gap-1 text-xs font-semibold text-slate-500">
          Compte de dotation (charge, debite chaque mois)
          <CompteSearch comptes={comptes} value={compteDotation} onChange={setCompteDotation} />
        </label>
        <label className="grid gap-1 text-xs font-semibold text-slate-500">
          Compte de contrepartie a l&apos;achat (Banque/Caisse/Fournisseur)
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
        {isPending ? "Enregistrement..." : "Ajouter l'immobilisation"}
      </button>
    </div>
  );
}
