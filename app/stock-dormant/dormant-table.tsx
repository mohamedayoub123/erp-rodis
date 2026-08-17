"use client";

import { useState } from "react";
import { formatDate } from "@/lib/format-date";

export type DormantTableRow = {
  lot_stock_id: number;
  nom_article: string;
  type_article: string | null;
  gamme: string | null;
  marque: string | null;
  numero_lot: string;
  stock_restant: number;
  date_fabrication: string;
  age_jours: number;
  couleur: string | null;
};

type ColumnKey =
  | "couleur"
  | "article"
  | "type"
  | "gamme"
  | "marque"
  | "lot"
  | "date_fab"
  | "age"
  | "qt";

const DEFAULT_COLUMNS: { key: ColumnKey; label: string }[] = [
  { key: "couleur", label: "Couleur" },
  { key: "article", label: "Article" },
  { key: "gamme", label: "Gamme" },
  { key: "type", label: "Type" },
  { key: "marque", label: "Marque" },
  { key: "lot", label: "Lot" },
  { key: "qt", label: "Qt restante" },
  { key: "date_fab", label: "Date fab." },
  { key: "age", label: "Age (jours)" },
];

function colorClasses(couleur: string | null) {
  switch (couleur) {
    case "ROUGE":
      return "bg-red-50 text-red-800 ring-1 ring-red-200";
    case "ORANGE":
      return "bg-orange-50 text-orange-800 ring-1 ring-orange-200";
    case "JAUNE":
      return "bg-amber-50 text-amber-900 ring-1 ring-amber-200";
    default:
      return "bg-slate-50 text-slate-700 ring-1 ring-slate-200";
  }
}

function renderCell(row: DormantTableRow, key: ColumnKey) {
  switch (key) {
    case "couleur":
      return (
        <span
          className={`inline-flex rounded-full px-3 py-1 text-xs font-bold uppercase tracking-[0.14em] ${colorClasses(
            row.couleur
          )}`}
        >
          {row.couleur || "-"}
        </span>
      );
    case "article":
      return <span className="font-medium text-slate-900">{row.nom_article}</span>;
    case "type":
      return row.type_article || "-";
    case "gamme":
      return row.gamme || "-";
    case "marque":
      return row.marque || "-";
    case "lot":
      return row.numero_lot;
    case "date_fab":
      return formatDate(row.date_fabrication);
    case "age":
      return row.age_jours;
    case "qt":
      return <span className="font-semibold text-amber-700">{row.stock_restant}</span>;
    default:
      return null;
  }
}

// Tableau avec colonnes reordonnables (fleches gauche/droite dans chaque
// entete) - l'ordre reste en memoire cote client tant que la page n'est
// pas rechargee, comme demande.
export function DormantTable({ rows }: { rows: DormantTableRow[] }) {
  const [columns, setColumns] = useState(DEFAULT_COLUMNS);

  function moveColumn(index: number, direction: -1 | 1) {
    setColumns((current) => {
      const target = index + direction;
      if (target < 0 || target >= current.length) return current;

      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  const isDefaultOrder = columns.every((column, index) => column.key === DEFAULT_COLUMNS[index].key);

  return (
    <div>
      <div className="mb-2 flex justify-end">
        <button
          type="button"
          onClick={() => setColumns(DEFAULT_COLUMNS)}
          disabled={isDefaultOrder}
          className="rounded-full border border-slate-200 px-4 py-1.5 text-xs font-semibold text-slate-600 disabled:opacity-40"
        >
          Effacer l&apos;ordre des colonnes
        </button>
      </div>

      <div className="max-h-[75vh] overflow-auto">
        <table className="min-w-full border-separate border-spacing-0 text-left text-sm">
          <thead className="bg-slate-50 text-slate-950">
            <tr>
              {columns.map((column, index) => (
                <th key={column.key} className="sticky top-0 z-10 bg-slate-50 px-6 py-4 font-semibold">
                  <div className="flex items-center justify-between gap-2">
                    <span>{column.label}</span>
                    <span className="flex gap-1">
                      <button
                        type="button"
                        onClick={() => moveColumn(index, -1)}
                        disabled={index === 0}
                        title="Deplacer a gauche"
                        className="rounded-full border border-slate-200 px-1.5 text-xs font-semibold text-slate-500 disabled:opacity-30"
                      >
                        {"◀"}
                      </button>
                      <button
                        type="button"
                        onClick={() => moveColumn(index, 1)}
                        disabled={index === columns.length - 1}
                        title="Deplacer a droite"
                        className="rounded-full border border-slate-200 px-1.5 text-xs font-semibold text-slate-500 disabled:opacity-30"
                      >
                        {"▶"}
                      </button>
                    </span>
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.lot_stock_id} className="border-t border-slate-100">
                {columns.map((column) => (
                  <td key={column.key} className="px-6 py-4 text-slate-600">
                    {renderCell(row, column.key)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
