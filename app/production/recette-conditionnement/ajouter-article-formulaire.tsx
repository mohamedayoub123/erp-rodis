"use client";

import { useState } from "react";
import { ProduitPickerField } from "@/app/production/suivi-production/produit-picker-field";

function round(value: number, decimals = 3) {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

// Meme convention que RecetteConditionnementFormulaire (page "nouvelle") :
// tous les articles MP se calculent automatiquement a raison de 1 par
// piece par defaut, sauf le carton/la boite (et le display box) qui
// suivent directement le nb de cartons.
function classifyAuto(label: string): "piece" | "carton" {
  const upper = label.toUpperCase();
  if (upper.includes("CARTON") || upper.includes("BOX") || upper.includes("DISPLAY")) return "carton";
  return "piece";
}

// Meme convention que RecetteConditionnementFormulaire (page "nouvelle") :
// id negatif = vrac (articles.id inverse), id positif = article MP. Un seul
// picker propose les deux, le composant cote serveur (addRecetteOuVracAction)
// route vers recettes_pf ou articles.vrac_article_id selon le signe.
export function AjouterArticleFormulaire({
  mpOptions,
  vracOptions,
  nbCarton,
  piecePartCarton,
}: {
  mpOptions: { id: number; label: string }[];
  vracOptions: { id: number; label: string }[];
  nbCarton: number | null;
  piecePartCarton: number | null;
}) {
  const [articleId, setArticleId] = useState<number | null>(null);
  const [quantite, setQuantite] = useState("");
  const [auto, setAuto] = useState(false);
  const estVrac = articleId !== null && articleId < 0;

  const combined = [
    ...mpOptions,
    ...vracOptions.map((article) => ({ id: -article.id, label: `${article.label} (vrac)` })),
  ];

  function handleSelect(id: number | null) {
    setArticleId(id);
    if (id === null || id < 0) {
      setQuantite("");
      setAuto(false);
      return;
    }
    const option = mpOptions.find((item) => item.id === id);
    const kind = option ? classifyAuto(option.label) : null;
    if (kind && nbCarton) {
      const computed = kind === "carton" ? nbCarton : piecePartCarton ? nbCarton * piecePartCarton : null;
      if (computed !== null) {
        setQuantite(String(round(computed, 3)));
        setAuto(true);
        return;
      }
    }
    setQuantite("");
    setAuto(false);
  }

  return (
    <div className="grid gap-1 sm:grid-cols-[1fr_auto_auto]">
      <div>
        <ProduitPickerField articles={combined} onSelect={handleSelect} />
        {auto ? (
          <p className="mt-1 text-xs text-slate-500">Quantite calculee automatiquement, modifiable si besoin.</p>
        ) : null}
      </div>
      <input
        type="number"
        step="0.001"
        min="0"
        name="quantite"
        value={quantite}
        onChange={(event) => {
          setQuantite(event.target.value);
          setAuto(false);
        }}
        placeholder="Quantite"
        required={!estVrac}
        disabled={estVrac}
        title={estVrac ? "Le vrac n'a pas de quantite a saisir ici, elle se calcule automatiquement." : undefined}
        className="w-32 rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none disabled:bg-slate-50"
      />
      <button
        type="submit"
        className="rounded-2xl bg-sky-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-sky-500"
      >
        Ajouter
      </button>
    </div>
  );
}
