"use client";

import { useState } from "react";
import { ProduitPickerField } from "@/app/production/suivi-production/produit-picker-field";

function round(value: number, decimals = 3) {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

// Meme convention que RecetteConditionnementFormulaire (page "nouvelle") :
// tous les articles MP se calculent automatiquement a raison de 1 par
// piece par defaut, "display" = le dispenseur (qt = dispenseur_pcs_carton
// de l'article PF), "carton" = la boite qui suit directement le nb de
// cartons.
function classifyAuto(label: string): "piece" | "carton" | "dispenseur" {
  const upper = label.toUpperCase();
  if (upper.includes("DISPLAY")) return "dispenseur";
  if (upper.includes("CARTON")) return "carton";
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
  dispenseurPcsCarton,
}: {
  mpOptions: { id: number; label: string }[];
  vracOptions: { id: number; label: string }[];
  nbCarton: number | null;
  piecePartCarton: number | null;
  dispenseurPcsCarton: number | null;
}) {
  const [articleId, setArticleId] = useState<number | null>(null);
  const [quantite, setQuantite] = useState("");
  const estVrac = articleId !== null && articleId < 0;

  const combined = [
    ...mpOptions,
    ...vracOptions.map((article) => ({ id: -article.id, label: `${article.label} (vrac)` })),
  ];

  function handleSelect(id: number | null) {
    setArticleId(id);
    if (id === null || id < 0 || !nbCarton) {
      setQuantite("");
      return;
    }
    const option = mpOptions.find((item) => item.id === id);
    const kind = option ? classifyAuto(option.label) : null;
    const computed =
      kind === "carton"
        ? nbCarton
        : kind === "dispenseur"
        ? dispenseurPcsCarton
          ? nbCarton * dispenseurPcsCarton
          : null
        : piecePartCarton
        ? nbCarton * piecePartCarton
        : null;
    setQuantite(computed !== null ? String(round(computed, 3)) : "");
  }

  return (
    <div className="grid gap-1 sm:grid-cols-[1fr_auto_auto]">
      <ProduitPickerField articles={combined} onSelect={handleSelect} />
      <input
        type="number"
        step="0.001"
        min="0"
        name="quantite"
        value={quantite}
        onChange={(event) => setQuantite(event.target.value)}
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
