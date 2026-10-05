"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { MAX_LIGNES, libelleMois, type ConfigCoutEau } from "@/lib/cout-eau";
import { SelecteurMois } from "../_components/selecteur-mois";
import { deleteCoutEauMoisAction, saveCoutEauAction } from "./actions";

// Les champs gardent le texte tape (virgule ou point accepte) ; la conversion
// en nombre se fait pour l'enregistrement.
type LigneSaisie = { cle: string; libelle: string; prix: string; precision: string; perso: boolean };
type ElecSaisie = { puissanceKw: string; prixKwh: string };
type Saisie = { lignes: LigneSaisie[]; electricite: { ligne1: ElecSaisie; ligne2: ElecSaisie } };
type NumeroLigne = "ligne1" | "ligne2";
type ChampElec = keyof ElecSaisie;

function enTexte(value: number | null) {
  return value === null ? "" : String(value);
}

function enNombre(texte: string): number | null {
  const propre = texte.trim().replace(/\s/g, "").replace(",", ".");
  if (!propre) return null;
  const n = Number(propre);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function elecEnTexte(l: ConfigCoutEau["electricite"]["ligne1"]): ElecSaisie {
  return {
    puissanceKw: enTexte(l.puissanceKw),
    prixKwh: enTexte(l.prixKwh),
  };
}

function elecEnNombres(l: ElecSaisie): ConfigCoutEau["electricite"]["ligne1"] {
  return {
    puissanceKw: enNombre(l.puissanceKw),
    prixKwh: enNombre(l.prixKwh),
  };
}

function versSaisie(config: ConfigCoutEau): Saisie {
  return {
    lignes: config.lignes.map((l) => ({
      cle: l.cle,
      libelle: l.libelle,
      prix: enTexte(l.prix),
      precision: l.precision,
      perso: !!l.perso,
    })),
    electricite: {
      ligne1: elecEnTexte(config.electricite.ligne1),
      ligne2: elecEnTexte(config.electricite.ligne2),
    },
  };
}

function versConfig(saisie: Saisie): ConfigCoutEau {
  return {
    lignes: saisie.lignes.map((l) => ({
      cle: l.cle,
      libelle: l.libelle,
      prix: enNombre(l.prix),
      precision: l.precision,
      perso: l.perso || undefined,
    })),
    electricite: {
      ligne1: elecEnNombres(saisie.electricite.ligne1),
      ligne2: elecEnNombres(saisie.electricite.ligne2),
    },
  };
}

const CHAMP =
  "w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none transition focus:border-sky-600 disabled:bg-slate-50 disabled:text-slate-500";

export function CoutEauForm({
  initial,
  annee,
  mois,
  annees,
  canEdit,
  canDelete,
  dejaEnregistre,
  repris,
}: {
  initial: ConfigCoutEau;
  annee: number;
  mois: number;
  annees: number[];
  canEdit: boolean;
  canDelete: boolean;
  dejaEnregistre: { par: string | null; le: string } | null;
  repris: string | null;
}) {
  const router = useRouter();
  const [saisie, setSaisie] = useState<Saisie>(() => versSaisie(initial));
  const [message, setMessage] = useState<{ type: "ok" | "erreur"; texte: string } | null>(null);
  const [enCours, demarrer] = useTransition();

  const config = useMemo(() => versConfig(saisie), [saisie]);

  function majLigne(cle: string, champ: "libelle" | "prix" | "precision", valeur: string) {
    setMessage(null);
    setSaisie((s) => ({ ...s, lignes: s.lignes.map((l) => (l.cle === cle ? { ...l, [champ]: valeur } : l)) }));
  }

  function majElec(ligne: NumeroLigne, champ: ChampElec, valeur: string) {
    setMessage(null);
    setSaisie((s) => ({
      ...s,
      electricite: { ...s.electricite, [ligne]: { ...s.electricite[ligne], [champ]: valeur } },
    }));
  }

  function ajouterLigne() {
    setMessage(null);
    setSaisie((s) =>
      s.lignes.length >= MAX_LIGNES
        ? s
        : {
            ...s,
            lignes: [...s.lignes, { cle: `perso_${Date.now()}`, libelle: "", prix: "", precision: "", perso: true }],
          }
    );
  }

  function supprimerLigne(cle: string) {
    setMessage(null);
    setSaisie((s) => ({ ...s, lignes: s.lignes.filter((l) => l.cle !== cle) }));
  }

  function enregistrer() {
    setMessage(null);
    demarrer(async () => {
      try {
        const reponse = await saveCoutEauAction(annee, mois, config);
        if (reponse.ok) {
          setMessage({ type: "ok", texte: `Prix de ${libelleMois(annee, mois)} enregistres.` });
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
    if (!window.confirm(`Supprimer les prix de ${libelleMois(annee, mois)} ?`)) return;
    setMessage(null);
    demarrer(async () => {
      try {
        const reponse = await deleteCoutEauMoisAction(annee, mois);
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
        basePath="/cout/prix-litre-eau"
        dejaEnregistre={dejaEnregistre}
        repris={repris}
        texteRepris="Les prix affiches viennent de {mois} : modifie-les puis enregistre."
      />

      <section className="rounded-[1.75rem] border border-black/5 bg-white p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
        <h2 className="text-lg font-bold text-slate-900">Prix des elements</h2>
        <p className="mt-1 text-sm text-slate-600">
          Saisis le <span className="font-semibold">prix d&apos;UNE unite</span> de chaque element (1 filtre, 1 lampe
          UV, 1 membrane, 1 sac de sel...). Le champ &laquo; Precision &raquo; est libre (ex : bidon de 25 L, sac de
          25 kg).
        </p>

        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full border-separate border-spacing-y-2 text-left text-sm">
            <thead className="text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-2 py-1 font-semibold">Element</th>
                <th className="px-2 py-1 font-semibold">Prix d&apos;une unite (FCFA)</th>
                <th className="px-2 py-1 font-semibold">Precision</th>
                {canEdit ? <th className="px-2 py-1" /> : null}
              </tr>
            </thead>
            <tbody>
              {saisie.lignes.map((ligne) => (
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
                      value={ligne.prix}
                      onChange={(e) => majLigne(ligne.cle, "prix", e.target.value)}
                      disabled={!canEdit}
                      className={CHAMP}
                    />
                  </td>
                  <td className="px-2">
                    <input
                      type="text"
                      value={ligne.precision}
                      onChange={(e) => majLigne(ligne.cle, "precision", e.target.value)}
                      maxLength={60}
                      disabled={!canEdit}
                      className={CHAMP}
                    />
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
            disabled={saisie.lignes.length >= MAX_LIGNES}
            className="mt-2 rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-500 disabled:opacity-50"
          >
            + Ajouter une ligne
          </button>
        ) : null}
      </section>

      <section className="rounded-[1.75rem] border border-black/5 bg-white p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
        <h2 className="text-lg font-bold text-slate-900">Electricite (pour chaque ligne)</h2>
        <p className="mt-1 text-sm text-slate-600">
          Saisis pour la Ligne 1 et pour la Ligne 2 : la consommation de la ligne et le prix du kWh. Le debit de
          l&apos;osmose est fixe : <span className="font-semibold">9 000 litres par heure</span> (rien a saisir).
          L&apos;electricite du mois est calculee automatiquement dans &laquo; Consommation par mois &raquo; :
          litres d&apos;eau &divide; 9 000 = heures de marche, puis x consommation de la ligne.
        </p>
        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full border-separate border-spacing-y-2 text-left text-sm">
            <thead className="text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-2 py-1 font-semibold">Electricite</th>
                <th className="px-2 py-1 font-semibold">Ligne 1</th>
                <th className="px-2 py-1 font-semibold">Ligne 2</th>
              </tr>
            </thead>
            <tbody>
              {(
                [
                  ["puissanceKw", "Consommation de la ligne (kW)"],
                  ["prixKwh", "Prix du kWh (FCFA)"],
                ] as [ChampElec, string][]
              ).map(([champ, libelle]) => (
                <tr key={champ}>
                  <td className="min-w-56 px-2 font-medium text-slate-900">{libelle}</td>
                  {(["ligne1", "ligne2"] as NumeroLigne[]).map((ligne) => (
                    <td key={ligne} className="px-2">
                      <input
                        type="text"
                        inputMode="decimal"
                        value={saisie.electricite[ligne][champ]}
                        onChange={(e) => majElec(ligne, champ, e.target.value)}
                        disabled={!canEdit}
                        className={CHAMP}
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
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
          Tu peux consulter ces prix mais pas les modifier.
        </p>
      )}
    </>
  );
}
