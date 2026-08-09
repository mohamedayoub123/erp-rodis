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

  return (
    <div className="grid gap-2">
      <div className="flex gap-4 text-xs font-semibold text-slate-500">
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
          Matiere premiere
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
          Produit fini
        </label>
      </div>
      <ProduitPickerField
        key={type}
        articles={type === "MP" ? articlesMp : articlesPf}
        hiddenName="article_id"
        textName="produit"
        onSelect={setArticleId}
      />

      {!depotSourceId ? null : !articleId ? null : loading ? (
        <p className="text-xs text-slate-400">Chargement du stock disponible...</p>
      ) : lots && lots.length > 0 ? (
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs">
          <p className="mb-1.5 font-semibold text-slate-500">Disponible dans le depot source :</p>
          <div className="grid gap-1">
            {lots.map((lot) => (
              <div key={lot.numeroLot} className="flex items-center justify-between gap-3">
                <span className="text-slate-700">{lot.numeroLot || "(sans numero de lot)"}</span>
                <span className="font-semibold text-slate-900">{lot.solde.toLocaleString("fr-FR")}</span>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <p className="text-xs font-semibold text-red-700">Aucun stock disponible dans ce depot pour cet article.</p>
      )}
    </div>
  );
}
