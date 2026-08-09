"use client";

import { useMemo, useRef, useState } from "react";
import { ProduitPickerField } from "@/app/production/suivi-production/produit-picker-field";

type ArticleOption = {
  id: number;
  label: string;
  vracArticleId: number | null;
  vracLabel: string | null;
  contenance: number | null;
  piecePartCarton: number | null;
};

type MachineOption = { id: number; label: string };

type CapaciteInfo = {
  capacite: number | null;
  capaciteMin: number | null;
  capaciteMax: number | null;
  tempsMinutes: number | null;
};

type Ligne = {
  key: number;
  articleId: number | null;
  machineFabricationId: number | null;
  machineConditionnementId: number | null;
  dureeMinutes: string;
  qtCarton: string;
  qtVrac: string;
  autoCalcule: boolean;
};

function round(value: number, decimals = 3) {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function ligneVide(key: number): Ligne {
  return {
    key,
    articleId: null,
    machineFabricationId: null,
    machineConditionnementId: null,
    dureeMinutes: "",
    qtCarton: "",
    qtVrac: "",
    autoCalcule: false,
  };
}

// Plusieurs articles dans le meme programme, une ligne par article. Chaque
// champ ecrit sous le meme nom sur toutes les lignes (ex: "article_id"),
// le serveur relit avec formData.getAll() dans l'ordre du DOM - les
// tableaux se correspondent tous par position pour creer une ligne
// "programmes" par article.
//
// Calcul automatique qt carton / qt vrac par ligne, a partir de la
// capacite des machines choisies (table machine_produits) : la machine
// Conditionnement donne une capacite en piece/min pour l'article fini, la
// machine Fabrication une cadence de vrac par heure. Le qt carton suit
// TOUJOURS la capacite de la chaine de conditionnement (jamais limite par
// ce que la fabrication peut fournir) - le qt vrac est ensuite derive de ce
// qt carton (qt carton x contenance x piece/carton). Si aucune machine de
// conditionnement n'est choisie, le vrac suit alors la fabrication seule.
export function ProgrammeFormulaire({
  articles,
  machinesFabrication,
  machinesConditionnement,
  capaciteParMachineArticle,
}: {
  articles: ArticleOption[];
  machinesFabrication: MachineOption[];
  machinesConditionnement: MachineOption[];
  capaciteParMachineArticle: Record<string, CapaciteInfo>;
}) {
  const [lignes, setLignes] = useState<Ligne[]>([ligneVide(0)]);
  const nextKey = useRef(1);

  const articleById = useMemo(() => new Map(articles.map((article) => [article.id, article])), [articles]);

  function updateLigne(key: number, patch: Partial<Ligne>) {
    setLignes((current) => current.map((ligne) => (ligne.key === key ? { ...ligne, ...patch } : ligne)));
  }

  function vracParCartonDe(ligne: Ligne) {
    const article = ligne.articleId ? articleById.get(ligne.articleId) : null;
    return article?.contenance && article?.piecePartCarton ? article.contenance * article.piecePartCarton : null;
  }

  // Qt carton et Qt vrac restent lies : modifier l'un recalcule l'autre a
  // partir de contenance x piece/carton de l'article choisi (meme si la
  // valeur vient d'un "Calculer" precedent ou d'une saisie manuelle). Si
  // cette conversion n'est pas connue pour l'article, les deux champs
  // restent independants.
  function updateQtCarton(key: number, rawCarton: string) {
    setLignes((current) =>
      current.map((ligne) => {
        if (ligne.key !== key) return ligne;
        const vracParCarton = vracParCartonDe(ligne);
        if (!vracParCarton) return { ...ligne, qtCarton: rawCarton };
        const carton = Number(rawCarton);
        const qtVrac = rawCarton && !Number.isNaN(carton) ? String(round(carton * vracParCarton)) : "";
        return { ...ligne, qtCarton: rawCarton, qtVrac };
      })
    );
  }

  function updateQtVrac(key: number, rawVrac: string) {
    setLignes((current) =>
      current.map((ligne) => {
        if (ligne.key !== key) return ligne;
        const vracParCarton = vracParCartonDe(ligne);
        if (!vracParCarton) return { ...ligne, qtVrac: rawVrac };
        const vrac = Number(rawVrac);
        const qtCarton = rawVrac && !Number.isNaN(vrac) ? String(round(vrac / vracParCarton)) : "";
        return { ...ligne, qtVrac: rawVrac, qtCarton };
      })
    );
  }

  function calculer(ligne: Ligne) {
    const article = ligne.articleId ? articleById.get(ligne.articleId) : null;
    const duree = Number(ligne.dureeMinutes);
    if (!article || !duree) return;

    const { contenance, piecePartCarton } = article;
    const vracParCarton = contenance && piecePartCarton ? contenance * piecePartCarton : null;

    const capaciteFabrication =
      ligne.machineFabricationId && article.vracArticleId
        ? capaciteParMachineArticle[`${ligne.machineFabricationId}-${article.vracArticleId}`] ?? null
        : null;
    const capaciteConditionnement = ligne.machineConditionnementId
      ? capaciteParMachineArticle[`${ligne.machineConditionnementId}-${article.id}`] ?? null
      : null;

    const cartonMaxConditionnement =
      capaciteConditionnement?.capacite && piecePartCarton
        ? (capaciteConditionnement.capacite * duree) / piecePartCarton
        : null;
    // capaciteMax est une cadence par heure (ex: 3000 kg/h) - sur la duree
    // prevue (en minutes), la fabrication peut fournir capaciteMax x
    // (duree / 60).
    const vracDisponibleFabrication =
      capaciteFabrication?.capaciteMax != null ? capaciteFabrication.capaciteMax * (duree / 60) : null;

    let carton: number | null = null;
    let vrac: number | null = null;

    if (cartonMaxConditionnement !== null) {
      // La chaine de conditionnement decide toujours du qt carton - le vrac
      // necessaire en decoule, jamais l'inverse.
      carton = round(cartonMaxConditionnement);
      vrac = vracParCarton ? round(carton * vracParCarton) : null;
    } else if (vracDisponibleFabrication !== null && vracParCarton) {
      vrac = round(vracDisponibleFabrication);
      carton = round(vracDisponibleFabrication / vracParCarton);
    }

    updateLigne(ligne.key, {
      qtCarton: carton !== null ? String(carton) : "",
      qtVrac: vrac !== null ? String(vrac) : "",
      autoCalcule: true,
    });
  }

  return (
    <div className="grid gap-4">
      <div className="overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-slate-50 text-slate-500">
            <tr>
              <th className="px-3 py-3 font-semibold">Article</th>
              <th className="px-3 py-3 font-semibold">Vrac</th>
              <th className="px-3 py-3 font-semibold">Machine Fabrication</th>
              <th className="px-3 py-3 font-semibold">Machine Conditionnement</th>
              <th className="px-3 py-3 font-semibold">Duree (min)</th>
              <th className="px-3 py-3 font-semibold"></th>
              <th className="px-3 py-3 font-semibold">Qt carton</th>
              <th className="px-3 py-3 font-semibold">Qt vrac</th>
              <th className="px-3 py-3 font-semibold"></th>
            </tr>
          </thead>
          <tbody>
            {lignes.map((ligne) => {
              const article = ligne.articleId ? articleById.get(ligne.articleId) : null;
              const articlesDisponibles = articles.filter(
                (item) =>
                  item.id === ligne.articleId ||
                  !lignes.some((autre) => autre.key !== ligne.key && autre.articleId === item.id)
              );
              return (
                <tr key={ligne.key} className="border-t border-slate-100 align-top">
                  <td className="min-w-[220px] px-3 py-3">
                    <ProduitPickerField
                      articles={articlesDisponibles}
                      hiddenName="article_id"
                      textName="produit"
                      onSelect={(articleId) => updateLigne(ligne.key, { articleId })}
                    />
                    <input type="hidden" name="vrac_article_id" value={article?.vracArticleId ?? ""} />
                  </td>
                  <td className="px-3 py-3 text-xs text-slate-600">
                    {article ? article.vracLabel || "non renseigne" : "-"}
                  </td>
                  <td className="min-w-[160px] px-3 py-3">
                    <select
                      name="machine_fabrication_id"
                      value={ligne.machineFabricationId ?? ""}
                      onChange={(event) =>
                        updateLigne(ligne.key, { machineFabricationId: Number(event.target.value) || null })
                      }
                      className="w-full rounded-2xl border border-slate-200 px-3 py-2 text-sm outline-none"
                    >
                      <option value="">Choisir...</option>
                      {machinesFabrication.map((machine) => (
                        <option key={machine.id} value={machine.id}>
                          {machine.label}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="min-w-[160px] px-3 py-3">
                    <select
                      name="machine_conditionnement_id"
                      value={ligne.machineConditionnementId ?? ""}
                      onChange={(event) =>
                        updateLigne(ligne.key, { machineConditionnementId: Number(event.target.value) || null })
                      }
                      className="w-full rounded-2xl border border-slate-200 px-3 py-2 text-sm outline-none"
                    >
                      <option value="">Choisir...</option>
                      {machinesConditionnement.map((machine) => (
                        <option key={machine.id} value={machine.id}>
                          {machine.label}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="w-28 px-3 py-3">
                    <input
                      type="number"
                      step="1"
                      min="0"
                      name="duree_minutes"
                      value={ligne.dureeMinutes}
                      onChange={(event) => updateLigne(ligne.key, { dureeMinutes: event.target.value })}
                      placeholder="Ex: 480"
                      className="w-full rounded-2xl border border-slate-200 px-3 py-2 text-sm outline-none"
                    />
                  </td>
                  <td className="px-3 py-3">
                    <button
                      type="button"
                      onClick={() => calculer(ligne)}
                      className="whitespace-nowrap rounded-2xl bg-slate-900 px-3 py-2 text-xs font-semibold text-white transition hover:bg-slate-800"
                    >
                      Calculer
                    </button>
                  </td>
                  <td className="w-28 px-3 py-3">
                    <input
                      type="number"
                      step="0.001"
                      min="0"
                      name="qt_carton"
                      value={ligne.qtCarton}
                      onChange={(event) => updateQtCarton(ligne.key, event.target.value)}
                      className="w-full rounded-2xl border border-slate-200 px-3 py-2 text-sm outline-none"
                    />
                  </td>
                  <td className="w-28 px-3 py-3">
                    <input
                      type="number"
                      step="0.001"
                      min="0"
                      name="qt_vrac"
                      value={ligne.qtVrac}
                      onChange={(event) => updateQtVrac(ligne.key, event.target.value)}
                      className="w-full rounded-2xl border border-slate-200 px-3 py-2 text-sm outline-none"
                    />
                  </td>
                  <td className="px-3 py-3">
                    <button
                      type="button"
                      onClick={() => setLignes((current) => current.filter((item) => item.key !== ligne.key))}
                      disabled={lignes.length <= 1}
                      className="whitespace-nowrap rounded-2xl border border-red-200 px-3 py-2 text-xs font-semibold text-red-700 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      Retirer
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div>
        <button
          type="button"
          onClick={() => {
            setLignes((current) => [...current, ligneVide(nextKey.current)]);
            nextKey.current += 1;
          }}
          className="rounded-2xl border border-slate-200 px-5 py-3 text-sm font-semibold text-slate-700 transition hover:border-slate-400"
        >
          + Ajouter un article
        </button>
      </div>
    </div>
  );
}
