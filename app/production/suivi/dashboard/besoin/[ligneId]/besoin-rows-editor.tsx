"use client";

import { useState, useTransition } from "react";
import { validerBatchAction, fetchBesoinArticleInfoAction } from "../../../actions";
import { ProduitPickerField } from "@/app/production/suivi-production/produit-picker-field";

type LotOption = { numeroLot: string; solde: number };

type Row = {
  key: string;
  articleId: number | null;
  articleLabel: string;
  unite: string;
  besoinText: string;
  stock: number;
  lots: LotOption[];
  numeroLot: string;
};

let rowKeySeed = 0;
function nextRowKey() {
  rowKeySeed += 1;
  return `row-${rowKeySeed}`;
}

export function BesoinRowsEditor({
  ligneId,
  code,
  stage,
  qt,
  depotBId,
  canWrite,
  initialRows,
  mpArticleOptions,
}: {
  ligneId: number;
  code: string;
  stage: "vrac" | "carton";
  qt: number;
  depotBId: number;
  canWrite: boolean;
  initialRows: { id: number; nom: string; unite: string; besoin: number; stock: number; lots: LotOption[] }[];
  mpArticleOptions: { id: number; label: string }[];
}) {
  const [rows, setRows] = useState<Row[]>(() =>
    initialRows.map((r) => ({
      key: nextRowKey(),
      articleId: r.id,
      articleLabel: r.nom,
      unite: r.unite,
      besoinText: String(r.besoin),
      stock: r.stock,
      lots: r.lots,
      numeroLot: "",
    }))
  );
  const [isLoading, startLoading] = useTransition();

  function addRow() {
    setRows((current) => [
      ...current,
      {
        key: nextRowKey(),
        articleId: null,
        articleLabel: "",
        unite: "-",
        besoinText: "",
        stock: 0,
        lots: [],
        numeroLot: "",
      },
    ]);
  }

  function removeRow(key: string) {
    setRows((current) => current.filter((row) => row.key !== key));
  }

  function updateRow(key: string, patch: Partial<Row>) {
    setRows((current) => current.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  }

  function handleSelectArticle(key: string, articleId: number | null, label?: string) {
    // articleLabel doit suivre la selection (pas seulement articleId) -
    // sinon une ligne ajoutee a la main (jamais prefilie par le serveur)
    // gardait un articleLabel vide en state parent, invisible tant que le
    // ProduitPickerField affichait son PROPRE texte interne - mais des que
    // Dispatch auto remontait cette ligne avec une NOUVELLE key (2e+ lot),
    // le nouveau champ se remontait avec defaultValue="" (bug confirme).
    updateRow(key, { articleId, articleLabel: label ?? "", unite: "-", stock: 0, lots: [], numeroLot: "" });
    if (!articleId) return;
    startLoading(async () => {
      const info = await fetchBesoinArticleInfoAction(articleId, depotBId);
      updateRow(key, { unite: info.unite, stock: info.disponible, lots: info.lots });
    });
  }

  function besoinNumDe(row: Row) {
    return Number(row.besoinText.replace(",", ".")) || 0;
  }

  // Disponible reel pour LA ligne, sur SON lot choisi - jamais le total de
  // l'article (tous lots confondus), sinon un lot sans assez de stock
  // apparaissait "OK" juste parce qu'un AUTRE lot du meme article avait le
  // reste (bug confirme : LANETTE SX 100kg + 100kg, besoin 200kg valide en
  // choisissant un seul des 2 lots). Si plusieurs lignes de ce formulaire
  // visent le MEME lot (Dispatch auto, ou ajoute a la main), le disponible
  // affiche diminue au fur et a mesure qu'il est repris par les autres.
  function disponibleReelPour(row: Row): number {
    if (!row.numeroLot) return row.stock;
    const soldeLot = row.lots.find((l) => l.numeroLot === row.numeroLot)?.solde ?? 0;
    const reprisParAutres = rows.reduce((sum, other) => {
      if (other.key === row.key) return sum;
      if (other.articleId !== row.articleId || other.numeroLot !== row.numeroLot) return sum;
      return sum + besoinNumDe(other);
    }, 0);
    return Math.max(0, soldeLot - reprisParAutres);
  }

  const anyInsuffisant = rows.some((row) => {
    const besoinNum = besoinNumDe(row);
    return row.articleId && besoinNum > 0 && besoinNum > disponibleReelPour(row);
  });

  // Repartit automatiquement chaque ligne sur autant de lots que necessaire
  // (FEFO, meme ordre que le select) plutot que de laisser choisir UN seul
  // lot pour un besoin qui peut depasser ce que CE lot contient a lui seul
  // - remplace chaque ligne article/besoin par 1 a N lignes (une par lot
  // utilise), chacune avec sa propre quantite et son propre numero de lot.
  // Si le total de tous les lots ne suffit toujours pas, la derniere ligne
  // garde le reste non couvert sans lot choisi (bloque la validation via le
  // champ obligatoire, au lieu de deviner ou de laisser passer un manque).
  function dispatchAuto() {
    setRows((current) => {
      const next: Row[] = [];
      for (const row of current) {
        const besoinNum = besoinNumDe(row);
        if (!row.articleId || besoinNum <= 0 || row.lots.length === 0) {
          next.push(row);
          continue;
        }
        let remaining = besoinNum;
        let firstRow = true;
        for (const lot of row.lots) {
          if (remaining <= 1e-9) break;
          const take = Math.min(lot.solde, remaining);
          if (take <= 1e-9) continue;
          next.push({
            key: firstRow ? row.key : nextRowKey(),
            articleId: row.articleId,
            articleLabel: row.articleLabel,
            unite: row.unite,
            besoinText: String(Math.round(take * 1000) / 1000),
            stock: row.stock,
            lots: row.lots,
            numeroLot: lot.numeroLot,
          });
          remaining -= take;
          firstRow = false;
        }
        if (remaining > 1e-6) {
          next.push({
            key: firstRow ? row.key : nextRowKey(),
            articleId: row.articleId,
            articleLabel: row.articleLabel,
            unite: row.unite,
            besoinText: String(Math.round(remaining * 1000) / 1000),
            stock: row.stock,
            lots: row.lots,
            numeroLot: "",
          });
        }
      }
      return next;
    });
  }

  return (
    <form action={validerBatchAction} className="grid gap-6">
      <input type="hidden" name="ligne_id" value={ligneId} />
      <input type="hidden" name="code" value={code} />
      <input type="hidden" name="stage" value={stage} />
      <input type="hidden" name="qt" value={qt} />
      {/* Le numero de lot du produit fini EST le code (deja connu, voir
          l'entete de la fiche) - inutile de le refaire taper. */}
      <input type="hidden" name="numero_lot" value={code} />

      <div className="overflow-x-auto rounded-[1.75rem] border border-black/5 bg-white shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-slate-50 text-slate-500">
            <tr>
              <th className="px-6 py-4 font-semibold">Article MP</th>
              <th className="px-6 py-4 font-semibold">Unite</th>
              <th className="px-6 py-4 font-semibold">Besoin</th>
              <th className="px-6 py-4 font-semibold">Disponible Depot B</th>
              <th className="px-6 py-4 font-semibold">Numero de lot</th>
              <th className="px-6 py-4 font-semibold">Statut</th>
              {canWrite ? <th className="px-6 py-4 font-semibold"></th> : null}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-6 py-8 text-sm text-slate-500">
                  Aucune ligne - ajoute un article ci-dessous.
                </td>
              </tr>
            ) : (
              rows.map((row) => {
                const besoinNum = besoinNumDe(row);
                const dispoReel = disponibleReelPour(row);
                const insuffisant = Boolean(row.articleId) && besoinNum > 0 && besoinNum > dispoReel;
                return (
                  <tr key={row.key} className="border-t border-slate-100">
                    <td className="px-6 py-4">
                      {canWrite ? (
                        <ProduitPickerField
                          articles={mpArticleOptions}
                          defaultValue={row.articleLabel}
                          defaultArticleId={row.articleId}
                          hiddenName="article_mp_id"
                          textName={`produit_display_${row.key}`}
                          onSelect={(articleId, label) => handleSelectArticle(row.key, articleId, label)}
                        />
                      ) : (
                        <span className="font-medium text-slate-900">{row.articleLabel}</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-slate-600">{row.unite}</td>
                    <td className="px-6 py-4">
                      {canWrite ? (
                        <input
                          type="number"
                          step="0.001"
                          min="0"
                          name="besoin"
                          value={row.besoinText}
                          onChange={(e) => updateRow(row.key, { besoinText: e.target.value })}
                          className="w-28 rounded-2xl border border-slate-200 px-3 py-2 text-sm text-slate-900 outline-none"
                        />
                      ) : (
                        row.besoinText
                      )}
                    </td>
                    <td className="px-6 py-4 text-slate-600">
                      {dispoReel.toLocaleString("fr-FR", { maximumFractionDigits: 3 })}
                      {row.numeroLot ? (
                        <span className="ml-1 text-xs text-slate-400">(lot {row.numeroLot})</span>
                      ) : null}
                    </td>
                    <td className="px-6 py-4">
                      {canWrite ? (
                        row.lots.length === 0 ? (
                          <span className="text-xs font-semibold text-red-700">Aucun lot au Depot B</span>
                        ) : (
                          <select
                            name="numero_lot_mp"
                            required={besoinNum > 0}
                            value={row.numeroLot}
                            onChange={(e) => updateRow(row.key, { numeroLot: e.target.value })}
                            className="w-52 rounded-2xl border border-slate-200 px-3 py-2 text-sm normal-case text-slate-900 outline-none"
                          >
                            <option value="" disabled>
                              Choisis un lot
                            </option>
                            {row.lots.map((lot) => (
                              <option key={lot.numeroLot} value={lot.numeroLot}>
                                {lot.numeroLot || "(sans numero)"} - dispo {lot.solde.toLocaleString("fr-FR")}
                              </option>
                            ))}
                          </select>
                        )
                      ) : (
                        row.numeroLot || "-"
                      )}
                    </td>
                    <td className="px-6 py-4">
                      {insuffisant ? (
                        <span className="rounded-full bg-red-50 px-3 py-1 text-xs font-semibold text-red-700">
                          Insuffisant
                        </span>
                      ) : (
                        <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
                          OK
                        </span>
                      )}
                    </td>
                    {canWrite ? (
                      <td className="px-6 py-4">
                        <button
                          type="button"
                          onClick={() => removeRow(row.key)}
                          className="rounded-full border border-red-200 px-3 py-1 text-xs font-semibold text-red-700 transition hover:bg-red-50"
                        >
                          Effacer
                        </button>
                      </td>
                    ) : null}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {canWrite ? (
        <div className="flex flex-wrap items-center gap-4">
          <button
            type="button"
            onClick={addRow}
            className="rounded-full border border-slate-300 px-5 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-slate-400"
          >
            + Ajouter un article
          </button>

          <button
            type="button"
            onClick={dispatchAuto}
            title="Repartit automatiquement chaque besoin sur autant de lots que necessaire (FEFO)"
            className="rounded-full border border-sky-300 bg-sky-50 px-5 py-2.5 text-sm font-semibold text-sky-700 transition hover:border-sky-400 hover:bg-sky-100"
          >
            Dispatch auto
          </button>

          <button
            type="submit"
            disabled={anyInsuffisant || isLoading}
            className="rounded-full bg-emerald-600 px-6 py-3 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            Valider - le batch est fait
          </button>

          {anyInsuffisant ? (
            <p className="w-full text-xs font-semibold text-red-700">
              Stock Depot B insuffisant pour au moins une matiere premiere - validation impossible.
            </p>
          ) : null}
        </div>
      ) : null}
    </form>
  );
}
