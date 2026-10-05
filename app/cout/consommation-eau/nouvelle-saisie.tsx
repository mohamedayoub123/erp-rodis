"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  ELEMENTS_SAISISSABLES,
  MAX_ELEMENTS_PAR_SAISIE,
  coutDe,
  dateFr,
  dateValide,
  formaterFcfa,
  moisDeDate,
  nombreValide,
  prixDeElement,
  uniteProposee,
  type LignePrixElement,
} from "@/lib/cout-eau-conso";
import { ajouterSaisiesAction } from "./actions";

// Les champs gardent le texte tape (virgule ou point accepte) ; la conversion
// en nombre se fait a l'enregistrement.
type LigneSaisie = { cle: string; libelle: string; ligne1: string; ligne2: string; unite: string; perso: boolean };

// L'unite proposee est celle du prix (precision saisie dans "Prix des
// consommables") quand elle existe : le cout = quantite x prix d'UNE unite.
function lignesVides(lignesPrix: LignePrixElement[]): LigneSaisie[] {
  return ELEMENTS_SAISISSABLES.map((e) => ({
    cle: e.cle,
    libelle: e.libelle,
    ligne1: "",
    ligne2: "",
    unite: uniteProposee(prixDeElement(lignesPrix, e)?.precision, e.unite),
    perso: false,
  }));
}

const CHAMP =
  "w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none transition focus:border-sky-600";

// Nouvelle saisie : une date, puis les quantites consommees ce jour-la sur la
// Ligne 1 et la Ligne 2. Seuls les elements renseignes sont enregistres.
export function NouvelleSaisie({
  annee,
  mois,
  dateInitiale,
  basePath,
  lignesPrix,
}: {
  annee: number;
  mois: number;
  dateInitiale: string;
  basePath: string;
  lignesPrix: LignePrixElement[];
}) {
  const router = useRouter();
  const [date, setDate] = useState(dateInitiale);
  const [lignes, setLignes] = useState<LigneSaisie[]>(() => lignesVides(lignesPrix));
  const [message, setMessage] = useState<{ type: "ok" | "erreur"; texte: string } | null>(null);
  const [enCours, demarrer] = useTransition();

  const aDesQuantites = lignes.some((l) => l.ligne1.trim() !== "" || l.ligne2.trim() !== "");

  function changerDate(valeur: string) {
    setMessage(null);
    setDate(valeur);
    // Une date d'un autre mois affiche directement ce mois (tant que rien n'est
    // saisi : on ne jette pas des quantites deja tapees).
    const choisie = dateValide(valeur);
    if (choisie && !aDesQuantites) {
      const m = moisDeDate(choisie);
      if (m.annee !== annee || m.mois !== mois) router.push(`${basePath}?date=${choisie}`);
    }
  }

  function majLigne(index: number, champ: "libelle" | "ligne1" | "ligne2" | "unite", valeur: string) {
    setMessage(null);
    setLignes((ls) => ls.map((l, i) => (i === index ? { ...l, [champ]: valeur } : l)));
  }

  function ajouterElement() {
    setMessage(null);
    setLignes((ls) =>
      ls.filter((l) => l.perso).length >= MAX_ELEMENTS_PAR_SAISIE
        ? ls
        : [...ls, { cle: `perso_${ls.length}`, libelle: "", ligne1: "", ligne2: "", unite: "", perso: true }]
    );
  }

  function retirerElement(index: number) {
    setMessage(null);
    setLignes((ls) => ls.filter((_, i) => i !== index));
  }

  function enregistrer() {
    setMessage(null);
    const dateChoisie = dateValide(date);
    if (!dateChoisie) {
      setMessage({ type: "erreur", texte: "Choisis une date." });
      return;
    }

    const remplies = lignes.filter((l) => l.ligne1.trim() !== "" || l.ligne2.trim() !== "");
    if (remplies.length === 0) {
      setMessage({ type: "erreur", texte: "Saisis au moins une quantite (Ligne 1 ou Ligne 2)." });
      return;
    }
    if (remplies.some((l) => l.perso && l.libelle.trim() === "")) {
      setMessage({ type: "erreur", texte: "Donne un nom a l'element ajoute." });
      return;
    }
    if (remplies.some((l) => (l.ligne1.trim() !== "" && nombreValide(l.ligne1) === null) || (l.ligne2.trim() !== "" && nombreValide(l.ligne2) === null))) {
      setMessage({ type: "erreur", texte: "Une quantite n'est pas un nombre valide." });
      return;
    }

    demarrer(async () => {
      try {
        const reponse = await ajouterSaisiesAction(
          dateChoisie,
          remplies.map((l) => ({
            cle: l.cle,
            libelle: l.libelle,
            unite: l.unite,
            ligne1: nombreValide(l.ligne1),
            ligne2: nombreValide(l.ligne2),
            perso: l.perso,
          }))
        );

        if (!reponse.ok) {
          setMessage({ type: "erreur", texte: reponse.message });
          return;
        }

        setLignes(lignesVides(lignesPrix));
        if (reponse.annee !== annee || reponse.mois !== mois) {
          router.push(`${basePath}?date=${dateChoisie}`);
        } else {
          setMessage({ type: "ok", texte: `Consommation du ${dateFr(dateChoisie)} enregistree.` });
          router.refresh();
        }
      } catch {
        setMessage({ type: "erreur", texte: "Enregistrement impossible (session fermee ?). Recharge la page." });
      }
    });
  }

  return (
    <section className="rounded-[1.75rem] border border-black/5 bg-white p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
      <h2 className="text-lg font-bold text-slate-900">Nouvelle saisie</h2>
      <p className="mt-1 text-sm text-slate-600">
        Choisis la date, puis saisis ce qui a ete consomme ce jour-la sur la{" "}
        <span className="font-semibold">Ligne 1</span> et sur la <span className="font-semibold">Ligne 2</span>. Seuls
        les elements renseignes sont enregistres. Le sel et le produit chlore ne se saisissent pas : ils viennent tout
        seuls des mouvements MP (sorties du mois, divisees sur les 2 lignes). Si tu choisis une date d&apos;un autre mois, la page affiche ce
        mois.
      </p>

      <label className="mt-4 grid max-w-56 gap-1 text-xs font-semibold text-slate-600">
        Date
        <input
          type="date"
          value={date}
          onChange={(e) => changerDate(e.target.value)}
          className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-900 outline-none focus:border-sky-600"
        />
      </label>

      <div className="mt-4 overflow-x-auto">
        <table className="min-w-full border-separate border-spacing-y-2 text-left text-sm">
          <thead className="text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-2 py-1 font-semibold">Element</th>
              <th className="px-2 py-1 font-semibold">Ligne 1</th>
              <th className="px-2 py-1 font-semibold">Ligne 2</th>
              <th className="px-2 py-1 font-semibold">Unite</th>
              <th className="px-2 py-1 text-right font-semibold">Prix d&apos;une unite (FCFA)</th>
              <th className="px-2 py-1 text-right font-semibold">Cout (FCFA)</th>
              <th className="px-2 py-1" />
            </tr>
          </thead>
          <tbody>
            {lignes.map((ligne, index) => {
              // Prix de la ligne : meme cle (elements habituels) ou meme nom (elements ajoutes)
              const prix =
                prixDeElement(lignesPrix, { cle: ligne.perso ? "" : ligne.cle, libelle: ligne.libelle })?.prix ?? null;
              const quantite =
                ligne.ligne1.trim() === "" && ligne.ligne2.trim() === ""
                  ? null
                  : (nombreValide(ligne.ligne1) ?? 0) + (nombreValide(ligne.ligne2) ?? 0);
              return (
              <tr key={`${ligne.cle}-${index}`}>
                <td className="min-w-48 px-2">
                  {ligne.perso ? (
                    <input
                      type="text"
                      value={ligne.libelle}
                      onChange={(e) => majLigne(index, "libelle", e.target.value)}
                      placeholder="Nom de l'element"
                      maxLength={80}
                      className={CHAMP}
                    />
                  ) : (
                    <span className="font-medium text-slate-900">{ligne.libelle}</span>
                  )}
                </td>
                <td className="px-2">
                  <input
                    type="text"
                    inputMode="decimal"
                    value={ligne.ligne1}
                    onChange={(e) => majLigne(index, "ligne1", e.target.value)}
                    className={CHAMP}
                  />
                </td>
                <td className="px-2">
                  <input
                    type="text"
                    inputMode="decimal"
                    value={ligne.ligne2}
                    onChange={(e) => majLigne(index, "ligne2", e.target.value)}
                    className={CHAMP}
                  />
                </td>
                <td className="w-28 px-2">
                  <input
                    type="text"
                    value={ligne.unite}
                    onChange={(e) => majLigne(index, "unite", e.target.value)}
                    maxLength={20}
                    className={CHAMP}
                  />
                </td>
                <td className="px-2 text-right text-slate-700">{formaterFcfa(prix, 4)}</td>
                <td className="px-2 text-right font-semibold text-slate-900">{formaterFcfa(coutDe(quantite, prix))}</td>
                <td className="px-2 text-right">
                  {ligne.perso ? (
                    <button
                      type="button"
                      onClick={() => retirerElement(index)}
                      className="text-xs font-semibold text-red-600 hover:underline"
                    >
                      Retirer
                    </button>
                  ) : null}
                </td>
              </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <button
        type="button"
        onClick={ajouterElement}
        className="mt-2 rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-500"
      >
        + Ajouter un element
      </button>

      <div className="mt-5 flex flex-wrap items-center gap-4">
        <button
          type="button"
          onClick={enregistrer}
          disabled={enCours}
          className="rounded-2xl bg-slate-950 px-6 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-60"
        >
          {enCours ? "Enregistrement..." : dateValide(date) ? `Enregistrer la saisie du ${dateFr(date)}` : "Enregistrer la saisie"}
        </button>
        {message ? (
          <p className={`text-sm font-semibold ${message.type === "ok" ? "text-emerald-700" : "text-red-600"}`}>
            {message.texte}
          </p>
        ) : null}
      </div>
    </section>
  );
}
