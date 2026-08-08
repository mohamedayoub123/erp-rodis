"use client";

import { useMemo, useRef, useState } from "react";
import { ProduitPickerField } from "@/app/production/suivi-production/produit-picker-field";

type PfOption = { id: number; label: string; contenance: number | null; piecePartCarton: number | null };
type MpOption = { id: number; label: string };

type Ligne = {
  key: number;
  articleId: number | null;
  quantite: string;
  pourcent: string;
};

function round(value: number, decimals = 3) {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

// Formulaire complet d'une recette Conditionnement : produit fini, vrac
// utilise, nombre de cartons du lot (avec qt vrac necessaire calculee
// automatiquement a partir de contenance/piece_par_carton de l'article -
// meme formule que le calcul vrac -> carton deja utilise dans Programme
// par ligne, juste inversee), puis les lignes MP (Quantite/% relies).
export function RecetteConditionnementFormulaire({
  pfArticles,
  vracArticles,
  mpArticles,
}: {
  pfArticles: PfOption[];
  vracArticles: { id: number; label: string }[];
  mpArticles: MpOption[];
}) {
  const [pfArticleId, setPfArticleId] = useState<number | null>(null);
  const [nbCarton, setNbCarton] = useState("");
  const [lignes, setLignes] = useState<Ligne[]>([{ key: 0, articleId: null, quantite: "", pourcent: "" }]);
  const nextKey = useRef(1);

  const pfSelectionne = useMemo(() => pfArticles.find((article) => article.id === pfArticleId) ?? null, [
    pfArticleId,
    pfArticles,
  ]);

  const qtVracNecessaire = useMemo(() => {
    const carton = Number(nbCarton);
    if (!pfSelectionne || !carton || Number.isNaN(carton)) return null;
    if (!pfSelectionne.contenance || !pfSelectionne.piecePartCarton) return null;
    return round(carton * pfSelectionne.piecePartCarton * pfSelectionne.contenance, 3);
  }, [nbCarton, pfSelectionne]);

  function updateQuantite(key: number, rawQuantite: string) {
    const total = Number(nbCarton);
    const q = Number(rawQuantite);
    const pourcent = total > 0 && rawQuantite && !Number.isNaN(q) ? String(round((q / total) * 100, 2)) : "";
    setLignes((current) =>
      current.map((ligne) => (ligne.key === key ? { ...ligne, quantite: rawQuantite, pourcent } : ligne))
    );
  }

  function updatePourcent(key: number, rawPourcent: string) {
    const total = Number(nbCarton);
    const p = Number(rawPourcent);
    const quantite = total > 0 && rawPourcent && !Number.isNaN(p) ? String(round((p / 100) * total, 3)) : "";
    setLignes((current) =>
      current.map((ligne) => (ligne.key === key ? { ...ligne, pourcent: rawPourcent, quantite } : ligne))
    );
  }

  function updateArticleId(key: number, articleId: number | null) {
    setLignes((current) => current.map((ligne) => (ligne.key === key ? { ...ligne, articleId } : ligne)));
  }

  return (
    <div className="grid gap-6">
      <div className="rounded-2xl border border-slate-200 p-5">
        <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-slate-500">
          Produit fini
        </h2>
        <ProduitPickerField
          articles={pfArticles}
          hiddenName="article_pf_id"
          textName="pf_produit"
          onSelect={setPfArticleId}
        />
      </div>

      <div className="rounded-2xl border border-slate-200 p-5">
        <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-slate-500">
          Vrac utilise et quantite du lot
        </h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <p className="mb-1 text-xs font-semibold text-slate-500">Article vrac</p>
            <ProduitPickerField articles={vracArticles} hiddenName="vrac_article_id" textName="vrac_produit" />
          </div>
          <label className="grid gap-1 text-xs font-semibold text-slate-500">
            Nombre de cartons du lot
            <input
              type="number"
              step="0.001"
              min="0"
              name="quantite_recette_base"
              value={nbCarton}
              onChange={(event) => setNbCarton(event.target.value)}
              placeholder="Ex: 500"
              className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-normal text-slate-900 outline-none"
            />
          </label>
        </div>
        <p className="mt-3 text-sm text-slate-600">
          Qt vrac necessaire pour ce lot :{" "}
          <span className="font-semibold text-slate-900">
            {qtVracNecessaire !== null
              ? `${qtVracNecessaire.toLocaleString("fr-FR", { maximumFractionDigits: 3 })} kg`
              : "-"}
          </span>
          {pfSelectionne && (!pfSelectionne.contenance || !pfSelectionne.piecePartCarton) ? (
            <span className="ml-2 text-xs text-amber-700">
              (contenance / piece par carton pas renseignes sur cet article)
            </span>
          ) : null}
        </p>
      </div>

      <div className="rounded-2xl border border-slate-200 p-5">
        <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-slate-500">
          Articles MP de la formule
        </h2>
        <div className="grid gap-3">
          {lignes.map((ligne) => {
            const articlesDisponibles = mpArticles.filter(
              (article) =>
                article.id === ligne.articleId ||
                !lignes.some((autre) => autre.key !== ligne.key && autre.articleId === article.id)
            );
            return (
              <div key={ligne.key} className="grid gap-2 sm:grid-cols-[1fr_auto_auto_auto] sm:items-start">
                <ProduitPickerField
                  articles={articlesDisponibles}
                  hiddenName="mp_article_id"
                  textName="mp_produit"
                  onSelect={(articleId) => updateArticleId(ligne.key, articleId)}
                />
                <input
                  type="number"
                  step="0.001"
                  min="0"
                  name="quantite_ligne"
                  value={ligne.quantite}
                  onChange={(event) => updateQuantite(ligne.key, event.target.value)}
                  placeholder="Quantite"
                  required
                  className="w-32 rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none"
                />
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  max="100"
                  value={ligne.pourcent}
                  onChange={(event) => updatePourcent(ligne.key, event.target.value)}
                  placeholder="%"
                  className="w-24 rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none"
                />
                <button
                  type="button"
                  onClick={() => setLignes((current) => current.filter((item) => item.key !== ligne.key))}
                  disabled={lignes.length <= 1}
                  className="rounded-2xl border border-red-200 px-4 py-3 text-sm font-semibold text-red-700 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Retirer
                </button>
              </div>
            );
          })}
        </div>

        <div className="mt-3">
          <button
            type="button"
            onClick={() => {
              setLignes((current) => [
                ...current,
                { key: nextKey.current, articleId: null, quantite: "", pourcent: "" },
              ]);
              nextKey.current += 1;
            }}
            className="rounded-2xl border border-slate-200 px-5 py-3 text-sm font-semibold text-slate-700 transition hover:border-slate-400"
          >
            + Ajouter une ligne
          </button>
        </div>
      </div>
    </div>
  );
}
