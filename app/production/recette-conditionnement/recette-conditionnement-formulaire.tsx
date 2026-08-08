"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ProduitPickerField } from "@/app/production/suivi-production/produit-picker-field";

type PfOption = { id: number; label: string; contenance: number | null; piecePartCarton: number | null };
type MpOption = { id: number; label: string };

type Ligne = {
  key: number;
  // Positif = article MP (articles_matiere_premiere). Negatif = vrac
  // (articles.id inverse) - les deux id-space sont distincts, le signe les
  // distingue sans avoir a dupliquer le composant de choix.
  articleId: number | null;
  quantite: string;
  quantiteAuto: boolean;
};

function round(value: number, decimals = 3) {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function ligneVide(key: number): Ligne {
  return { key, articleId: null, quantite: "", quantiteAuto: false };
}

// Formulaire complet d'une recette Conditionnement : produit fini, nombre de
// cartons du lot, puis UNE SEULE liste "Articles MP de la formule" qui
// regroupe les vrais articles MP et le vrac (nature=vrac) - le vrac se
// choisit dans la meme liste que les MP (id negatif = vrac, cote client
// seulement) et sa quantite se calcule automatiquement (nb cartons x piece
// par carton x contenance de l'article PF choisi), tout en restant
// modifiable a la main. Les vrais MP restent a quantite manuelle. Pas de %.
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
  const [lignes, setLignes] = useState<Ligne[]>([ligneVide(0)]);
  const nextKey = useRef(1);

  const pfSelectionne = useMemo(() => pfArticles.find((article) => article.id === pfArticleId) ?? null, [
    pfArticleId,
    pfArticles,
  ]);

  const combinedOptions = useMemo(
    () => [
      ...mpArticles.map((article) => ({ id: article.id, label: article.label })),
      ...vracArticles.map((article) => ({ id: -article.id, label: `${article.label} (vrac)` })),
    ],
    [mpArticles, vracArticles]
  );

  function computeVracQuantite() {
    const carton = Number(nbCarton);
    if (!pfSelectionne || !carton || Number.isNaN(carton)) return null;
    if (!pfSelectionne.contenance || !pfSelectionne.piecePartCarton) return null;
    return round(carton * pfSelectionne.piecePartCarton * pfSelectionne.contenance, 3);
  }

  // Le vrac choisi suit automatiquement le nombre de cartons / la
  // contenance-piece de l'article PF tant que l'utilisateur n'a pas modifie
  // la quantite a la main (quantiteAuto passe alors a false pour cette ligne).
  useEffect(() => {
    const computed = computeVracQuantite();
    if (computed === null) return;
    setLignes((current) =>
      current.map((ligne) =>
        ligne.articleId !== null && ligne.articleId < 0 && ligne.quantiteAuto
          ? { ...ligne, quantite: String(computed) }
          : ligne
      )
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nbCarton, pfSelectionne]);

  function updateQuantite(key: number, rawQuantite: string) {
    setLignes((current) =>
      current.map((ligne) => (ligne.key === key ? { ...ligne, quantite: rawQuantite, quantiteAuto: false } : ligne))
    );
  }

  function updateArticleId(key: number, articleId: number | null) {
    setLignes((current) =>
      current.map((ligne) => {
        if (ligne.key !== key) return ligne;
        if (articleId !== null && articleId < 0) {
          const computed = computeVracQuantite();
          return {
            ...ligne,
            articleId,
            quantiteAuto: true,
            quantite: computed !== null ? String(computed) : ligne.quantite,
          };
        }
        return { ...ligne, articleId, quantiteAuto: false };
      })
    );
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
          Quantite du lot
        </h2>
        <label className="grid max-w-xs gap-1 text-xs font-semibold text-slate-500">
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
        {pfSelectionne && (!pfSelectionne.contenance || !pfSelectionne.piecePartCarton) ? (
          <p className="mt-3 text-xs text-amber-700">
            Contenance / piece par carton pas renseignes sur cet article - le calcul automatique du
            vrac ne pourra pas se faire.
          </p>
        ) : null}
      </div>

      <div className="rounded-2xl border border-slate-200 p-5">
        <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-slate-500">
          Articles MP de la formule
        </h2>
        <div className="grid gap-3">
          {lignes.map((ligne) => {
            const estVrac = ligne.articleId !== null && ligne.articleId < 0;
            const optionsDisponibles = combinedOptions.filter(
              (option) =>
                option.id === ligne.articleId ||
                !lignes.some((autre) => autre.key !== ligne.key && autre.articleId === option.id)
            );
            return (
              <div key={ligne.key} className="grid gap-1 sm:grid-cols-[1fr_auto_auto] sm:items-start">
                <div>
                  <ProduitPickerField
                    articles={optionsDisponibles}
                    hiddenName={`_ignore_produit_${ligne.key}`}
                    textName="mp_produit"
                    onSelect={(articleId) => updateArticleId(ligne.key, articleId)}
                  />
                  {estVrac ? (
                    <>
                      <input type="hidden" name="vrac_article_id" value={-ligne.articleId!} />
                      <p className="mt-1 text-xs text-slate-500">
                        Vrac - quantite calculee automatiquement (nb cartons x piece/carton x
                        contenance), modifiable si besoin.
                      </p>
                    </>
                  ) : (
                    <input type="hidden" name="mp_article_id" value={ligne.articleId ?? ""} />
                  )}
                </div>
                <input
                  type="number"
                  step="0.001"
                  min="0"
                  name={estVrac ? undefined : "quantite_ligne"}
                  value={ligne.quantite}
                  onChange={(event) => updateQuantite(ligne.key, event.target.value)}
                  placeholder="Quantite"
                  required
                  className="w-32 rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none"
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
              setLignes((current) => [...current, ligneVide(nextKey.current)]);
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
