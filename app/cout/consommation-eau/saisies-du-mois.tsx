"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  AUTEUR_CONSO_AUTO,
  coutDe,
  dateFr,
  dateValide,
  formaterFcfa,
  PART_AUTO_PAR_LIGNE,
  formaterQuantite,
  prixDeElement,
  totalLigne1Ligne2,
  type ConsoAutoMp,
  type LignePrixElement,
  type SaisieConsoEau,
} from "@/lib/cout-eau-conso";
import { modifierSaisieAction, supprimerSaisieAction } from "./actions";

type Brouillon = { date: string; ligne1: string; ligne2: string; unite: string };

const CHAMP =
  "w-full rounded-lg border border-slate-300 px-2 py-1 text-sm outline-none transition focus:border-sky-600";

// Liste des saisies datees du mois choisi : on peut corriger la date, les
// quantites et l'unite (droit Modifier) ou supprimer une saisie (droit
// Supprimer).
export function SaisiesDuMois({
  saisies,
  annee,
  mois,
  canEdit,
  canDelete,
  basePath,
  lignesPrix,
  clesAuto,
  autos,
}: {
  saisies: SaisieConsoEau[];
  annee: number;
  mois: number;
  canEdit: boolean;
  canDelete: boolean;
  basePath: string;
  lignesPrix: LignePrixElement[];
  // Elements calcules automatiquement (mouvements MP) : leurs saisies manuelles ne sont pas comptees
  clesAuto: string[];
  // Consommation automatique du mois (mouvements MP) : Sel et Produit chlore
  autos: ConsoAutoMp[];
}) {
  const router = useRouter();
  const [enEdition, setEnEdition] = useState<number | null>(null);
  const [brouillon, setBrouillon] = useState<Brouillon | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [enCours, demarrer] = useTransition();

  function commencer(s: SaisieConsoEau) {
    setMessage(null);
    setEnEdition(s.id);
    setBrouillon({
      date: s.date,
      ligne1: s.ligne1 === null ? "" : String(s.ligne1),
      ligne2: s.ligne2 === null ? "" : String(s.ligne2),
      unite: s.unite,
    });
  }

  function annuler() {
    setEnEdition(null);
    setBrouillon(null);
    setMessage(null);
  }

  function enregistrer(id: number) {
    if (!brouillon) return;
    if (!dateValide(brouillon.date)) {
      setMessage("Choisis une date valide.");
      return;
    }
    setMessage(null);
    demarrer(async () => {
      try {
        const reponse = await modifierSaisieAction(id, brouillon.date, brouillon.ligne1, brouillon.ligne2, brouillon.unite);
        if (!reponse.ok) {
          setMessage(reponse.message);
          return;
        }
        setEnEdition(null);
        setBrouillon(null);
        if (reponse.annee !== annee || reponse.mois !== mois) {
          router.push(`${basePath}?date=${brouillon.date}`);
        } else {
          router.refresh();
        }
      } catch {
        setMessage("Modification impossible (session fermee ?). Recharge la page.");
      }
    });
  }

  function supprimer(s: SaisieConsoEau) {
    if (!window.confirm(`Supprimer ${s.libelle} du ${dateFr(s.date)} ?`)) return;
    setMessage(null);
    demarrer(async () => {
      try {
        const reponse = await supprimerSaisieAction(s.id);
        if (!reponse.ok) {
          setMessage(reponse.message);
          return;
        }
        router.refresh();
      } catch {
        setMessage("Suppression impossible (session fermee ?). Recharge la page.");
      }
    });
  }

  const modifiable = canEdit || canDelete;

  // Prix d'UNE unite de l'element de la saisie (meme cle, sinon meme nom)
  function prixDe(s: SaisieConsoEau): number | null {
    return prixDeElement(lignesPrix, s)?.prix ?? null;
  }

  return (
    <section className="overflow-hidden rounded-[1.75rem] border border-black/5 bg-white shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
      <div className="border-b border-slate-100 px-5 py-4">
        <h2 className="text-lg font-bold text-slate-900">Saisies du mois</h2>
        <p className="mt-1 text-sm text-slate-600">Chaque ligne est une consommation avec sa date.</p>
      </div>

      {message ? <p className="px-5 pt-4 text-sm font-semibold text-red-600">{message}</p> : null}

      {saisies.length === 0 && autos.length === 0 ? (
        <p className="px-5 py-6 text-sm text-slate-500">Aucune saisie pour ce mois.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-50 text-slate-950">
              <tr>
                <th className="px-5 py-3 font-semibold">Date</th>
                <th className="px-5 py-3 font-semibold">Element</th>
                <th className="px-5 py-3 font-semibold">Ligne 1</th>
                <th className="px-5 py-3 font-semibold">Ligne 2</th>
                <th className="px-5 py-3 font-semibold">Unite</th>
                <th className="px-5 py-3 text-right font-semibold">Total</th>
                <th className="px-5 py-3 text-right font-semibold">Prix d&apos;une unite (FCFA)</th>
                <th className="px-5 py-3 text-right font-semibold">Cout (FCFA)</th>
                <th className="px-5 py-3 font-semibold">Saisi par</th>
                {modifiable ? <th className="px-5 py-3" /> : null}
              </tr>
            </thead>
            <tbody>
              {autos.map((a) => {
                const prix = prixDeElement(lignesPrix, a)?.prix ?? null;
                return (
                  <tr key={`auto-${a.cle}`} className="border-t border-slate-100 bg-sky-50/50 align-middle">
                    <td className="px-5 py-3 font-semibold text-slate-900">Tout le mois</td>
                    <td className="px-5 py-3 font-medium text-slate-900">
                      {a.libelle}
                      <span className="no-print ml-2 rounded-full bg-sky-100 px-2 py-0.5 text-xs font-semibold text-sky-800">
                        auto
                      </span>
                    </td>
                    <td className="px-5 py-3 text-slate-700">{formaterQuantite(a.quantite * PART_AUTO_PAR_LIGNE)}</td>
                    <td className="px-5 py-3 text-slate-700">{formaterQuantite(a.quantite * PART_AUTO_PAR_LIGNE)}</td>
                    <td className="px-5 py-3 text-slate-700">{a.unite || "-"}</td>
                    <td className="px-5 py-3 text-right font-semibold text-sky-800">{formaterQuantite(a.quantite)}</td>
                    <td className="px-5 py-3 text-right text-slate-700">{formaterFcfa(prix, 4)}</td>
                    <td className="px-5 py-3 text-right font-semibold text-slate-900">
                      {formaterFcfa(coutDe(a.quantite, prix))}
                    </td>
                    <td className="px-5 py-3 text-slate-600">
                      {AUTEUR_CONSO_AUTO}
                      <span className="block text-xs text-slate-500">mouvements MP ({a.nombre})</span>
                    </td>
                    {modifiable ? <td className="px-5 py-3" /> : null}
                  </tr>
                );
              })}
              {saisies.map((s) => {
                const edition = enEdition === s.id && brouillon;
                return (
                  <tr key={s.id} className="border-t border-slate-100 align-middle">
                    <td className="px-5 py-3 text-slate-900">
                      {edition ? (
                        <input
                          type="date"
                          value={brouillon.date}
                          onChange={(e) => setBrouillon({ ...brouillon, date: e.target.value })}
                          className={CHAMP}
                        />
                      ) : (
                        <span className="font-semibold">{dateFr(s.date)}</span>
                      )}
                    </td>
                    <td className="px-5 py-3 font-medium text-slate-900">{s.libelle}</td>
                    <td className="px-5 py-3 text-slate-700">
                      {edition ? (
                        <input
                          type="text"
                          inputMode="decimal"
                          value={brouillon.ligne1}
                          onChange={(e) => setBrouillon({ ...brouillon, ligne1: e.target.value })}
                          className={CHAMP}
                        />
                      ) : (
                        formaterQuantite(s.ligne1)
                      )}
                    </td>
                    <td className="px-5 py-3 text-slate-700">
                      {edition ? (
                        <input
                          type="text"
                          inputMode="decimal"
                          value={brouillon.ligne2}
                          onChange={(e) => setBrouillon({ ...brouillon, ligne2: e.target.value })}
                          className={CHAMP}
                        />
                      ) : (
                        formaterQuantite(s.ligne2)
                      )}
                    </td>
                    <td className="px-5 py-3 text-slate-700">
                      {edition ? (
                        <input
                          type="text"
                          value={brouillon.unite}
                          maxLength={20}
                          onChange={(e) => setBrouillon({ ...brouillon, unite: e.target.value })}
                          className={CHAMP}
                        />
                      ) : (
                        s.unite || "-"
                      )}
                    </td>
                    <td className="px-5 py-3 text-right font-semibold text-sky-800">
                      {formaterQuantite(totalLigne1Ligne2(s))}
                    </td>
                    {clesAuto.includes(s.cle) ? (
                      <td className="px-5 py-3 text-right text-xs font-semibold text-amber-700" colSpan={2}>
                        non compte : vient des mouvements MP
                      </td>
                    ) : (
                      <>
                        <td className="px-5 py-3 text-right text-slate-700">{formaterFcfa(prixDe(s), 4)}</td>
                        <td className="px-5 py-3 text-right font-semibold text-slate-900">
                          {formaterFcfa(coutDe(totalLigne1Ligne2(s), prixDe(s)))}
                        </td>
                      </>
                    )}
                    <td className="px-5 py-3 text-slate-600">{s.par ?? "-"}</td>
                    {modifiable ? (
                      <td className="whitespace-nowrap px-5 py-3 text-right">
                        {edition ? (
                          <>
                            <button
                              type="button"
                              onClick={() => enregistrer(s.id)}
                              disabled={enCours}
                              className="mr-3 text-xs font-semibold text-emerald-700 hover:underline disabled:opacity-60"
                            >
                              Enregistrer
                            </button>
                            <button type="button" onClick={annuler} className="text-xs font-semibold text-slate-600 hover:underline">
                              Annuler
                            </button>
                          </>
                        ) : (
                          <>
                            {canEdit ? (
                              <button
                                type="button"
                                onClick={() => commencer(s)}
                                disabled={enCours}
                                className="mr-3 text-xs font-semibold text-sky-700 hover:underline disabled:opacity-60"
                              >
                                Modifier
                              </button>
                            ) : null}
                            {canDelete ? (
                              <button
                                type="button"
                                onClick={() => supprimer(s)}
                                disabled={enCours}
                                className="text-xs font-semibold text-red-600 hover:underline disabled:opacity-60"
                              >
                                Supprimer
                              </button>
                            ) : null}
                          </>
                        )}
                      </td>
                    ) : null}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
