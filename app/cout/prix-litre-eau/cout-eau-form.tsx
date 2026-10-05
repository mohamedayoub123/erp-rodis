"use client";

import { useMemo, useState, useTransition } from "react";
import {
  MAX_LIGNES,
  calculerCoutEau,
  coutParLitreElectricite,
  coutParLitreLigne,
  type ConfigCoutEau,
} from "@/lib/cout-eau";
import { saveCoutEauAction } from "./actions";

// Les champs gardent le texte tape (virgule ou point accepte) ; la conversion
// en nombre se fait pour le calcul et l'enregistrement.
type LigneSaisie = { cle: string; libelle: string; prix: string; litres: string; perso: boolean };
type Saisie = {
  lignes: LigneSaisie[];
  puissanceKw: string;
  prixKwh: string;
  litresParHeure: string;
};

function enTexte(value: number | null) {
  return value === null ? "" : String(value);
}

function enNombre(texte: string): number | null {
  const propre = texte.trim().replace(/\s/g, "").replace(",", ".");
  if (!propre) return null;
  const n = Number(propre);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function versSaisie(config: ConfigCoutEau): Saisie {
  return {
    lignes: config.lignes.map((l) => ({
      cle: l.cle,
      libelle: l.libelle,
      prix: enTexte(l.prix),
      litres: enTexte(l.litres),
      perso: !!l.perso,
    })),
    puissanceKw: enTexte(config.electricite.puissanceKw),
    prixKwh: enTexte(config.electricite.prixKwh),
    litresParHeure: enTexte(config.electricite.litresParHeure),
  };
}

function versConfig(saisie: Saisie): ConfigCoutEau {
  return {
    lignes: saisie.lignes.map((l) => ({
      cle: l.cle,
      libelle: l.libelle,
      prix: enNombre(l.prix),
      litres: enNombre(l.litres),
      perso: l.perso || undefined,
    })),
    electricite: {
      puissanceKw: enNombre(saisie.puissanceKw),
      prixKwh: enNombre(saisie.prixKwh),
      litresParHeure: enNombre(saisie.litresParHeure),
    },
  };
}

function formaterFcfa(value: number | null, decimales = 4) {
  if (value === null) return "-";
  return value.toLocaleString("fr-FR", { maximumFractionDigits: decimales });
}

function formaterDate(iso: string) {
  const d = new Date(iso);
  const jj = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return `${jj}-${mm}-${d.getFullYear()} a ${hh}h${mi}`;
}

const CHAMP =
  "w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none transition focus:border-sky-600 disabled:bg-slate-50 disabled:text-slate-500";

export function CoutEauForm({
  initial,
  canEdit,
  derniereModification,
}: {
  initial: ConfigCoutEau;
  canEdit: boolean;
  derniereModification: { par: string | null; le: string } | null;
}) {
  const [saisie, setSaisie] = useState<Saisie>(() => versSaisie(initial));
  const [message, setMessage] = useState<{ type: "ok" | "erreur"; texte: string } | null>(null);
  const [enregistrement, demarrer] = useTransition();

  const config = useMemo(() => versConfig(saisie), [saisie]);
  const resultat = useMemo(() => calculerCoutEau(config), [config]);
  const coutElec = coutParLitreElectricite(config.electricite);

  function majLigne(cle: string, champ: "libelle" | "prix" | "litres", valeur: string) {
    setMessage(null);
    setSaisie((s) => ({ ...s, lignes: s.lignes.map((l) => (l.cle === cle ? { ...l, [champ]: valeur } : l)) }));
  }

  function majElec(champ: "puissanceKw" | "prixKwh" | "litresParHeure", valeur: string) {
    setMessage(null);
    setSaisie((s) => ({ ...s, [champ]: valeur }));
  }

  function ajouterLigne() {
    setMessage(null);
    setSaisie((s) =>
      s.lignes.length >= MAX_LIGNES
        ? s
        : {
            ...s,
            lignes: [...s.lignes, { cle: `perso_${Date.now()}`, libelle: "", prix: "", litres: "", perso: true }],
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
        const reponse = await saveCoutEauAction(config);
        setMessage(
          reponse.ok
            ? { type: "ok", texte: "Prix enregistres." }
            : { type: "erreur", texte: reponse.message }
        );
      } catch {
        setMessage({ type: "erreur", texte: "Enregistrement impossible (session fermee ?). Recharge la page." });
      }
    });
  }

  return (
    <>
      <section className="rounded-[1.75rem] border border-sky-200 bg-sky-50 p-6 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-sky-800">Prix de revient</p>
        <div className="mt-2 flex flex-wrap items-end gap-x-10 gap-y-3">
          <div>
            <p className="text-4xl font-black tracking-tight text-slate-950">
              {formaterFcfa(resultat.totalParLitre)} <span className="text-lg font-bold">FCFA / litre</span>
            </p>
            <p className="mt-1 text-sm text-slate-600">
              soit <span className="font-semibold">{formaterFcfa(resultat.totalPour1000Litres, 2)} FCFA</span> les
              1 000 litres (1 m&sup3;)
            </p>
          </div>
        </div>
        {resultat.lignesIncompletes.length > 0 ? (
          <p className="mt-3 text-sm font-medium text-amber-800">
            Pas comptees (prix ou litres manquant) : {resultat.lignesIncompletes.join(", ")}.
          </p>
        ) : null}
      </section>

      <section className="rounded-[1.75rem] border border-black/5 bg-white p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
        <h2 className="text-lg font-bold text-slate-900">Filtres, produits, UV, membrane, sel</h2>
        <p className="mt-1 text-sm text-slate-600">
          Pour chaque ligne : le <span className="font-semibold">prix d&apos;un achat</span> (FCFA) et le{" "}
          <span className="font-semibold">nombre de litres d&apos;eau produits</span> avec cet achat (sa duree de vie).
          Exemple : un filtre a 5 000 FCFA qui dure 100 000 litres coute 0,05 FCFA par litre.
        </p>

        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full border-separate border-spacing-y-2 text-left text-sm">
            <thead className="text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-2 py-1 font-semibold">Element</th>
                <th className="px-2 py-1 font-semibold">Prix d&apos;un achat (FCFA)</th>
                <th className="px-2 py-1 font-semibold">Litres produits avec cet achat</th>
                <th className="px-2 py-1 text-right font-semibold">Cout par litre (FCFA)</th>
                {canEdit ? <th className="px-2 py-1" /> : null}
              </tr>
            </thead>
            <tbody>
              {saisie.lignes.map((ligne, index) => {
                const cout = coutParLitreLigne(config.lignes[index]);
                return (
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
                        inputMode="decimal"
                        value={ligne.litres}
                        onChange={(e) => majLigne(ligne.cle, "litres", e.target.value)}
                        disabled={!canEdit}
                        className={CHAMP}
                      />
                    </td>
                    <td className="px-2 text-right font-semibold text-sky-800">{formaterFcfa(cout)}</td>
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
                );
              })}
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
        <h2 className="text-lg font-bold text-slate-900">Electricite (consommation kW)</h2>
        <p className="mt-1 text-sm text-slate-600">
          Cout par litre = puissance (kW) x prix du kWh / litres produits par heure.
        </p>
        <div className="mt-4 grid gap-4 sm:grid-cols-4">
          <label className="grid gap-1 text-xs font-semibold text-slate-500">
            Puissance de l&apos;installation (kW)
            <input
              type="text"
              inputMode="decimal"
              value={saisie.puissanceKw}
              onChange={(e) => majElec("puissanceKw", e.target.value)}
              disabled={!canEdit}
              className={CHAMP}
            />
          </label>
          <label className="grid gap-1 text-xs font-semibold text-slate-500">
            Prix du kWh (FCFA)
            <input
              type="text"
              inputMode="decimal"
              value={saisie.prixKwh}
              onChange={(e) => majElec("prixKwh", e.target.value)}
              disabled={!canEdit}
              className={CHAMP}
            />
          </label>
          <label className="grid gap-1 text-xs font-semibold text-slate-500">
            Litres produits par heure
            <input
              type="text"
              inputMode="decimal"
              value={saisie.litresParHeure}
              onChange={(e) => majElec("litresParHeure", e.target.value)}
              disabled={!canEdit}
              className={CHAMP}
            />
          </label>
          <div className="grid gap-1 text-xs font-semibold text-slate-500">
            Cout par litre (FCFA)
            <p className="px-1 py-2 text-sm font-semibold text-sky-800">{formaterFcfa(coutElec)}</p>
          </div>
        </div>
      </section>

      {canEdit ? (
        <section className="flex flex-wrap items-center gap-4 rounded-[1.75rem] border border-black/5 bg-white p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
          <button
            type="button"
            onClick={enregistrer}
            disabled={enregistrement}
            className="rounded-2xl bg-slate-950 px-6 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-60"
          >
            {enregistrement ? "Enregistrement..." : "Enregistrer les prix"}
          </button>
          {message ? (
            <p className={`text-sm font-semibold ${message.type === "ok" ? "text-emerald-700" : "text-red-600"}`}>
              {message.texte}
            </p>
          ) : null}
          {derniereModification ? (
            <p className="text-xs text-slate-500">
              Derniere modification : {formaterDate(derniereModification.le)}
              {derniereModification.par ? ` par ${derniereModification.par}` : ""}
            </p>
          ) : null}
        </section>
      ) : (
        <p className="rounded-2xl bg-slate-100 px-4 py-3 text-sm text-slate-600">
          Tu peux consulter ces prix mais pas les modifier.
          {derniereModification ? ` Derniere modification : ${formaterDate(derniereModification.le)}.` : ""}
        </p>
      )}
    </>
  );
}
