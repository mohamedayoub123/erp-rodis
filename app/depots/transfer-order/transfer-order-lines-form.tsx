"use client";

import { useState } from "react";
import { TransferArticlePicker } from "./article-picker";

export function TransferOrderLinesForm({
  depots,
  articlesMp,
  articlesPf,
}: {
  depots: { id: number; nom: string }[];
  articlesMp: { id: number; label: string }[];
  articlesPf: { id: number; label: string }[];
}) {
  const [depotSourceId, setDepotSourceId] = useState<number | null>(null);
  const [rowKeys, setRowKeys] = useState<number[]>([0]);
  const [nextKey, setNextKey] = useState(1);

  return (
    <div className="grid gap-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="grid gap-1 text-xs font-semibold text-slate-500">
          Depot source
          <select
            name="depot_source_id"
            required
            value={depotSourceId ?? ""}
            onChange={(e) => setDepotSourceId(e.target.value ? Number(e.target.value) : null)}
            className="rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none"
          >
            <option value="">Choisir...</option>
            {depots.map((d) => (
              <option key={d.id} value={d.id}>
                {d.nom}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-xs font-semibold text-slate-500">
          Depot destination
          <select
            name="depot_destination_id"
            required
            defaultValue=""
            className="rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none"
          >
            <option value="">Choisir...</option>
            {depots.map((d) => (
              <option key={d.id} value={d.id}>
                {d.nom}
              </option>
            ))}
          </select>
        </label>
      </div>

      {rowKeys.map((key) => (
        <div key={key} className="grid gap-3 rounded-2xl border border-slate-200 p-4">
          <TransferArticlePicker articlesMp={articlesMp} articlesPf={articlesPf} depotSourceId={depotSourceId} />
          <div className="flex items-end gap-3">
            <label className="grid flex-1 gap-1 text-xs font-semibold text-slate-500">
              Quantite demandee
              <input
                type="number"
                step="0.001"
                min="0"
                name="quantite_demandee"
                required
                className="rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none"
              />
            </label>
            {rowKeys.length > 1 ? (
              <button
                type="button"
                onClick={() => setRowKeys(rowKeys.filter((k) => k !== key))}
                className="rounded-full border border-red-200 px-4 py-3 text-xs font-semibold text-red-700 transition hover:bg-red-50"
              >
                Retirer
              </button>
            ) : null}
          </div>
        </div>
      ))}
      <div>
        <button
          type="button"
          onClick={() => {
            setRowKeys([...rowKeys, nextKey]);
            setNextKey(nextKey + 1);
          }}
          className="rounded-full border border-slate-200 px-5 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-400"
        >
          + Ajouter un article
        </button>
      </div>
    </div>
  );
}
