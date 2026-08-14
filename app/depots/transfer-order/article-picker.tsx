"use client";

import { useEffect, useState } from "react";
import { ProduitPickerField } from "@/app/production/suivi-production/produit-picker-field";
import { fetchAvailableLotsAction } from "./actions";

type DepotLot = { numeroLot: string; solde: number; dateTri: string | null };

// Une ligne de Transfer Order peut porter sur un article MP ou PF - ce choix
// (article_type, radio natif du formulaire) determine simplement quelle
// liste d'articles alimente ProduitPickerField. Des qu'un article ET un
// depot source sont choisis, va chercher en direct les lots/quantites
// reellement disponibles dans ce depot pour cet article - pour que
// l'utilisateur sache quoi demander avant meme de creer le Transfer Order.
// Rendu en 1 seule ligne compacte (type + article + disponible total) - le
// detail lot par lot n'a plus sa place ici, seule la somme est affichee,
// pour que chaque article tienne sur sa propre ligne dans le formulaire.
export function TransferArticlePicker({
  articlesMp,
  articlesPf,
  depotSourceId,
}: {
  articlesMp: { id: number; label: string }[];
  articlesPf: { id: number; label: string }[];
  depotSourceId: number | null;
}) {
  const [type, setType] = useState<"MP" | "PF">("MP");
  const [articleId, setArticleId] = useState<number | null>(null);
  const [lots, setLots] = useState<DepotLot[] | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!articleId || !depotSourceId) {
      setLots(null);
      return;
    }

    let cancelled = false;
    setLoading(true);

    fetchAvailableLotsAction(type, articleId, depotSourceId).then((result) => {
      if (!cancelled) {
        setLots(result as DepotLot[]);
        setLoading(false);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [articleId, depotSourceId, type]);

  const totalDisponible = lots?.reduce((sum, lot) => sum + lot.solde, 0) ?? null;

  return (
    <div className="flex flex-1 flex-wrap items-center gap-3">
      <div className="flex shrink-0 gap-3 text-xs font-semibold text-slate-500">
        <label className="flex items-center gap-1.5">
          <input
            type="radio"
            name="article_type"
            value="MP"
            checked={type === "MP"}
            onChange={() => {
              setType("MP");
              setArticleId(null);
            }}
          />
          MP
        </label>
        <label className="flex items-center gap-1.5">
          <input
            type="radio"
            name="article_type"
            value="PF"
            checked={type === "PF"}
            onChange={() => {
              setType("PF");
              setArticleId(null);
            }}
          />
          PF
        </label>
      </div>

      <div className="min-w-[14rem] flex-1">
        <ProduitPickerField
          key={type}
          articles={type === "MP" ? articlesMp : articlesPf}
          hiddenName="article_id"
          textName="produit"
          onSelect={setArticleId}
        />
      </div>

      <div className="w-44 shrink-0 text-right text-xs">
        {!depotSourceId || !articleId ? (
          <span className="text-slate-400">-</span>
        ) : loading ? (
          <span className="text-slate-400">Chargement...</span>
        ) : totalDisponible !== null && totalDisponible > 0 ? (
          <span className="font-semibold text-slate-700">
            Disponible : {totalDisponible.toLocaleString("fr-FR")}
          </span>
        ) : (
          <span className="font-semibold text-red-700">Aucun stock</span>
        )}
      </div>
    </div>
  );
}
