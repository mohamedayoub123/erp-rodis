"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  ajouterCodeVracConditionnementAction,
  listerCodesVracPretsAction,
  retirerCodeVracConditionnementAction,
} from "./code-vrac-actions";
import type { CodeVracDisponible } from "@/lib/conditionnement-codes-vrac";

type Choix = { id: number; codeVrac: string; quantite: number };

function formater(valeur: number): string {
  return valeur.toLocaleString("fr-FR", { maximumFractionDigits: 3 });
}

// Colonne "N Lot" du Conditionnement (Dashboard) : vide au depart ; on choisit le ou les codes VRAC conditionnes sur cette ligne avec la
// quantite de vrac (kg) prise sur chacun. Les codes proposes sont ceux du vrac de l'article dont la Fabrication est deja entree (liste
// chargee a l'ouverture, pas dans la page) ; on peut taper pour trouver un code plus vite, un code qui n'existe pas est refuse. Le reste
// de vrac d'un code reste disponible pour une autre ligne.
export function CodeVracCell({
  ligneId,
  code,
  choix,
  peutModifier,
}: {
  ligneId: number;
  code: string;
  choix: Choix[];
  peutModifier: boolean;
}) {
  const router = useRouter();
  const [ouvert, setOuvert] = useState(false);
  const [liste, setListe] = useState<CodeVracDisponible[] | null>(null);
  const [vracNom, setVracNom] = useState<string | null>(null);
  const [saisie, setSaisie] = useState("");
  const [quantite, setQuantite] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [enCours, demarrer] = useTransition();

  function ouvrir() {
    setOuvert(true);
    setMessage(null);
    demarrer(async () => {
      try {
        const reponse = await listerCodesVracPretsAction(ligneId);
        if (!reponse.ok) {
          setMessage(reponse.message);
          return;
        }
        setListe(reponse.codes);
        setVracNom(reponse.vracNom);
        if (reponse.codes.length === 0) setMessage("Aucun code vrac pret pour cet article (Fabrication entree + Test labo fait).");
      } catch {
        setMessage("Chargement impossible (session fermee ?). Recharge la page.");
      }
    });
  }

  function fermer() {
    setOuvert(false);
    setSaisie("");
    setQuantite("");
    setMessage(null);
  }

  // Quand le code tape existe dans la liste, la quantite proposee = tout ce qu'il en reste (modifiable)
  function changerCode(valeur: string) {
    setSaisie(valeur);
    setMessage(null);
    const trouve = liste?.find((c) => c.code.toLowerCase() === valeur.trim().toLowerCase());
    if (trouve) setQuantite(String(trouve.disponible));
  }

  function valider() {
    const codeSaisi = saisie.trim();
    if (!liste) return;
    const trouve = liste.find((c) => c.code.toLowerCase() === codeSaisi.toLowerCase());
    if (!codeSaisi) return setMessage("Choisis un code vrac.");
    if (!trouve) return setMessage(`Le code ${codeSaisi} n'existe pas dans la liste. Choisis un code propose.`);
    const nombre = Number(quantite.replace(",", "."));
    if (!Number.isFinite(nombre) || nombre <= 0) return setMessage("Mets la quantite de vrac (kg) a prendre sur ce code.");
    if (nombre > trouve.disponible + 0.0005) return setMessage(`Il ne reste que ${formater(trouve.disponible)} kg sur ${trouve.code}.`);
    setMessage(null);
    demarrer(async () => {
      try {
        const reponse = await ajouterCodeVracConditionnementAction(ligneId, code, trouve.code, nombre);
        if (!reponse.ok) {
          setMessage(reponse.message);
          return;
        }
        fermer();
        setListe(null);
        router.refresh();
      } catch {
        setMessage("Enregistrement impossible (session fermee ?). Recharge la page.");
      }
    });
  }

  function retirer(choixId: number) {
    setMessage(null);
    demarrer(async () => {
      try {
        const reponse = await retirerCodeVracConditionnementAction(choixId);
        if (!reponse.ok) {
          setMessage(reponse.message);
          return;
        }
        setListe(null);
        router.refresh();
      } catch {
        setMessage("Suppression impossible (session fermee ?). Recharge la page.");
      }
    });
  }

  const idListe = `codes-vrac-${ligneId}-${code}`;

  return (
    <div className="flex min-w-[9rem] flex-col gap-1">
      {choix.map((c) => (
        <span
          key={c.id}
          className="inline-flex w-fit items-center gap-1 rounded-full bg-sky-50 px-2 py-0.5 text-xs font-semibold text-sky-800"
          title={`${formater(c.quantite)} kg de vrac pris sur le code ${c.codeVrac}`}
        >
          {c.codeVrac} · {formater(c.quantite)} kg
          {peutModifier ? (
            <button
              type="button"
              onClick={() => retirer(c.id)}
              disabled={enCours}
              aria-label={`Retirer ${c.codeVrac}`}
              className="text-sky-500 hover:text-red-600 disabled:opacity-50"
            >
              ×
            </button>
          ) : null}
        </span>
      ))}

      {peutModifier && !ouvert ? (
        <button
          type="button"
          onClick={ouvrir}
          className="w-fit rounded-full border border-dashed border-sky-300 px-2 py-0.5 text-xs font-semibold text-sky-700 hover:bg-sky-50"
        >
          {choix.length === 0 ? "Choisir le code vrac" : "+ autre code"}
        </button>
      ) : null}

      {peutModifier && ouvert ? (
        <div className="flex flex-col gap-1 rounded-xl border border-sky-200 bg-white p-2 shadow-sm">
          <input
            type="text"
            list={idListe}
            value={saisie}
            onChange={(evenement) => changerCode(evenement.target.value)}
            placeholder={liste ? "Taper ou choisir un code" : "Chargement..."}
            disabled={!liste}
            autoComplete="off"
            className="w-44 rounded border border-slate-200 px-1.5 py-0.5 text-xs text-slate-800 focus:border-sky-400 focus:outline-none"
          />
          <datalist id={idListe}>
            {(liste ?? []).map((c) => (
              <option key={c.code} value={c.code} label={`${formater(c.disponible)} kg disponibles`} />
            ))}
          </datalist>
          {vracNom ? <span className="text-[11px] text-slate-500">Vrac : {vracNom}</span> : null}
          <div className="flex items-center gap-1">
            <input
              type="number"
              min="0"
              step="any"
              value={quantite}
              onChange={(evenement) => setQuantite(evenement.target.value)}
              placeholder="Qt vrac (kg)"
              className="w-28 rounded border border-slate-200 px-1.5 py-0.5 text-xs text-slate-800 focus:border-sky-400 focus:outline-none"
            />
            <button
              type="button"
              onClick={valider}
              disabled={enCours || !liste}
              className="rounded bg-sky-700 px-2 py-0.5 text-xs font-semibold text-white hover:bg-sky-600 disabled:opacity-50"
            >
              {enCours ? "..." : "OK"}
            </button>
            <button type="button" onClick={fermer} className="rounded px-1.5 py-0.5 text-xs font-semibold text-slate-500 hover:bg-slate-100">
              Annuler
            </button>
          </div>
        </div>
      ) : null}

      {message ? <span className="max-w-[16rem] text-xs font-semibold text-red-600">{message}</span> : null}
    </div>
  );
}
