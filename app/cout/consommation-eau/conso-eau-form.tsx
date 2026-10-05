"use client";

import { useMemo, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { libelleMois } from "@/lib/cout-eau";
import {
  MAX_LIGNES_CONSO,
  totalDesLignes,
  type ConfigConsoEau,
} from "@/lib/cout-eau-conso";
import { SelecteurMois } from "../_components/selecteur-mois";
import { deleteConsoEauMoisAction, saveConsoEauAction } from "./actions";

// Les champs gardent le texte tape (virgule ou point accepte) ; la conversion
// en nombre se fait pour le total et l'enregistrement.
type LigneSaisie = { cle: string; libelle: string; ligne1: string; ligne2: string; unite: string; perso: boolean };

function enTexte(value: number | null) {
  return value === null ? "" : String(value);
}

function enNombre(texte: string): number | null {
  const propre = texte.trim().replace(/\s/g, "").replace(",", ".");
  if (!propre) return null;
  const n = Number(propre);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function versSaisie(config: ConfigConsoEau): LigneSaisie[] {
  return config.lignes.map((l) => ({
    cle: l.cle,
    libelle: l.libelle,
    ligne1: enTexte(l.ligne1),
    ligne2: enTexte(l.ligne2),
    unite: l.unite,
    perso: !!l.perso,
  }));
}

function versConfig(lignes: LigneSaisie[]): ConfigConsoEau {
  return {
    lignes: lignes.map((l) => ({
      cle: l.cle,
      libelle: l.libelle,
      ligne1: enNombre(l.ligne1),
      ligne2: enNombre(l.ligne2),
      unite: l.unite,
      perso: l.perso || undefined,
    })),
  };
}

function formaterNombre(value: number | null) {
  return value === null ? "-" : value.toLocaleString("fr-FR", { maximumFractionDigits: 4 });
}

const CHAMP =
  "w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none transition focus:border-sky-600 disabled:bg-slate-50 disabled:text-slate-500";

export function ConsoEauForm({
  initial,
  annee,
  mois,
  annees,
  panneauEau,
  canEdit,
  canDelete,
  dejaEnregistre,
}: {
  initial: ConfigConsoEau;
  annee: number;
  mois: number;
  annees: number[];
  // Eau utilisee du mois (calcul automatique), affichee au-dessus de la saisie
  panneauEau: ReactNode;
  canEdit: boolean;
  canDelete: boolean;
  dejaEnregistre: { par: string | null; le: string } | null;
}) {
  const router = useRouter();
  const [lignes, setLignes] = useState<LigneSaisie[]>(() => versSaisie(initial));
  const [message, setMessage] = useState<{ type: "ok" | "erreur"; texte: string } | null>(null);
  const [enCours, demarrer] = useTransition();

  const config = useMemo(() => versConfig(lignes), [lignes]);

  function majLigne(cle: string, champ: "libelle" | "ligne1" | "ligne2" | "unite", valeur: string) {
    setMessage(null);
    setLignes((ls) => ls.map((l) => (l.cle === cle ? { ...l, [champ]: valeur } : l)));
  }

  function ajouterLigne() {
    setMessage(null);
    setLignes((ls) =>
      ls.length >= MAX_LIGNES_CONSO
        ? ls
        : [...ls, { cle: `perso_${Date.now()}`, libelle: "", ligne1: "", ligne2: "", unite: "", perso: true }]
    );
  }

  function supprimerLigne(cle: string) {
    setMessage(null);
    setLignes((ls) => ls.filter((l) => l.cle !== cle));
  }

  function enregistrer() {
    setMessage(null);
    demarrer(async () => {
      try {
        const reponse = await saveConsoEauAction(annee, mois, config);
        if (reponse.ok) {
          setMessage({ type: "ok", texte: `Consommation de ${libelleMois(annee, mois)} enregistree.` });
          router.refresh();
        } else {
          setMessage({ type: "erreur", texte: reponse.message });
        }
      } catch {
        setMessage({ type: "erreur", texte: "Enregistrement impossible (session fermee ?). Recharge la page." });
      }
    });
  }

  function supprimerMois() {
    if (!window.confirm(`Supprimer la consommation de ${libelleMois(annee, mois)} ?`)) return;
    setMessage(null);
    demarrer(async () => {
      try {
        const reponse = await deleteConsoEauMoisAction(annee, mois);
        if (reponse.ok) {
          router.refresh();
        } else {
          setMessage({ type: "erreur", texte: reponse.message });
        }
      } catch {
        setMessage({ type: "erreur", texte: "Suppression impossible (session fermee ?). Recharge la page." });
      }
    });
  }

  return (
    <>
      <SelecteurMois
        annee={annee}
        mois={mois}
        annees={annees}
        basePath="/cout/consommation-eau"
        dejaEnregistre={dejaEnregistre}
        repris={null}
        texteRepris=""
      />

      {panneauEau}

      <section className="rounded-[1.75rem] border border-black/5 bg-white p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
        <h2 className="text-lg font-bold text-slate-900">Consommation du mois</h2>
        <p className="mt-1 text-sm text-slate-600">
          Saisis ce qui a ete consomme dans le mois sur la <span className="font-semibold">Ligne 1</span> et sur la{" "}
          <span className="font-semibold">Ligne 2</span>. L&apos;unite est libre (pieces, kg, L, kWh...). Le total est
          calcule automatiquement ; le calcul du prix du litre viendra ensuite.
        </p>

        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full border-separate border-spacing-y-2 text-left text-sm">
            <thead className="text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-2 py-1 font-semibold">Element</th>
                <th className="px-2 py-1 font-semibold">Ligne 1</th>
                <th className="px-2 py-1 font-semibold">Ligne 2</th>
                <th className="px-2 py-1 font-semibold">Unite</th>
                <th className="px-2 py-1 text-right font-semibold">Total</th>
                {canEdit ? <th className="px-2 py-1" /> : null}
              </tr>
            </thead>
            <tbody>
              {lignes.map((ligne, index) => (
                <tr key={ligne.cle}>
                  <td className="min-w-48 px-2">
                    {ligne.perso ? (
                      <input
                        type="text"
                        value={ligne.libelle}
                        onChange={(e) => majLigne(ligne.cle, "libelle", e.target.value)}
                        placeholder="Nom de la ligne"
                        disabled={!canEdit}
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
                      onChange={(e) => majLigne(ligne.cle, "ligne1", e.target.value)}
                      disabled={!canEdit}
                      className={CHAMP}
                    />
                  </td>
                  <td className="px-2">
                    <input
                      type="text"
                      inputMode="decimal"
                      value={ligne.ligne2}
                      onChange={(e) => majLigne(ligne.cle, "ligne2", e.target.value)}
                      disabled={!canEdit}
                      className={CHAMP}
                    />
                  </td>
                  <td className="w-28 px-2">
                    <input
                      type="text"
                      value={ligne.unite}
                      onChange={(e) => majLigne(ligne.cle, "unite", e.target.value)}
                      maxLength={20}
                      disabled={!canEdit}
                      className={CHAMP}
                    />
                  </td>
                  <td className="px-2 text-right font-semibold text-sky-800">
                    {formaterNombre(totalDesLignes(config.lignes[index]))}
                  </td>
                  {canEdit ? (
                    <td className="px-2 text-right">
                      {ligne.perso ? (
                        <button
                          type="button"
                          onClick={() => supprimerLigne(ligne.cle)}
                          className="text-xs font-semibold text-red-600 hover:underline"
                        >
                          Retirer
                        </button>
                      ) : null}
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {canEdit ? (
          <button
            type="button"
            onClick={ajouterLigne}
            disabled={lignes.length >= MAX_LIGNES_CONSO}
            className="mt-2 rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-500 disabled:opacity-50"
          >
            + Ajouter un element
          </button>
        ) : null}
      </section>

      {canEdit ? (
        <section className="flex flex-wrap items-center gap-4 rounded-[1.75rem] border border-black/5 bg-white p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
          <button
            type="button"
            onClick={enregistrer}
            disabled={enCours}
            className="rounded-2xl bg-slate-950 px-6 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-60"
          >
            {enCours ? "Enregistrement..." : `Enregistrer ${libelleMois(annee, mois)}`}
          </button>
          {dejaEnregistre && canDelete ? (
            <button
              type="button"
              onClick={supprimerMois}
              disabled={enCours}
              className="rounded-2xl border border-red-200 px-5 py-3 text-sm font-semibold text-red-700 transition hover:bg-red-50 disabled:opacity-60"
            >
              Supprimer ce mois
            </button>
          ) : null}
          {message ? (
            <p className={`text-sm font-semibold ${message.type === "ok" ? "text-emerald-700" : "text-red-600"}`}>
              {message.texte}
            </p>
          ) : null}
        </section>
      ) : (
        <p className="rounded-2xl bg-slate-100 px-4 py-3 text-sm text-slate-600">
          Tu peux consulter cette consommation mais pas la modifier.
        </p>
      )}
    </>
  );
}
