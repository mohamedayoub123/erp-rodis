"use client";

import { useState } from "react";
import * as XLSX from "xlsx";
import { fetchStockMpExportRowsAction, type StockMpExportFilters } from "./actions";

const EXPORT_COLUMNS = [
  { label: "Date", key: "date_jour" },
  { label: "Article", key: "nom_article" },
  { label: "Type", key: "type_label" },
  { label: "Categorie", key: "categorie" },
  { label: "Gamme", key: "gamme" },
  { label: "Lot", key: "numero_lot" },
  { label: "Unite", key: "unite" },
  { label: "Date fab.", key: "date_fabrication" },
  { label: "Date exp.", key: "date_expiration" },
  { label: "Entree", key: "entree" },
  { label: "Sortie", key: "sortie" },
  { label: "Stock code", key: "stock_code" },
  { label: "Stock article", key: "stock_article" },
  { label: "Fournisseur / Client", key: "fournisseur_client" },
  { label: "Doss. ERP", key: "n_doss_erp" },
  { label: "Doss. 4D", key: "n_doss_4d" },
  { label: "Note", key: "note" },
  { label: "Saisi par", key: "utilisateur" },
  { label: "Date de saisie", key: "created_at" },
] as const;

// Meme rendu Excel que ExportExcelButton (app/_components/export-excel-button.tsx)
// mais les lignes ne sont pas deja en memoire cote client (la page ne garde
// que les 200 lignes affichees) - on va chercher la liste complete
// correspondant au filtre actif au clic, via fetchStockMpExportRowsAction.
export function StockMpExportButton({ filters }: { filters: StockMpExportFilters }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleExport() {
    setLoading(true);
    setError(null);

    try {
      const rows = await fetchStockMpExportRowsAction(filters);

      const data = rows.map((row) => ({
        date_jour: row.date_jour ?? "",
        nom_article: row.nom_article ?? "",
        type_label: row.mouvement_type === "entree" ? "Entree" : "Sortie",
        categorie: row.categorie ?? "",
        gamme: row.gamme ?? "",
        numero_lot: row.numero_lot ?? "",
        unite: row.unite ?? "",
        date_fabrication: row.date_fabrication ?? "",
        date_expiration: row.date_expiration ?? "",
        entree: row.mouvement_type === "entree" ? row.qte_entree : 0,
        sortie: row.mouvement_type === "sortie" ? row.qte_sortie : 0,
        stock_code: row.stock_code,
        stock_article: row.stock_article,
        fournisseur_client: (row.mouvement_type === "entree" ? row.fournisseur : row.client) ?? "",
        n_doss_erp: row.n_doss_erp ?? "",
        n_doss_4d: row.n_doss_4d ?? "",
        note: row.note ?? "",
        utilisateur: row.utilisateur ?? "",
        created_at: row.created_at ?? "",
      }));

      const exportData = data.map((row) =>
        Object.fromEntries(EXPORT_COLUMNS.map((column) => [column.label, row[column.key as keyof typeof row]]))
      );

      const worksheet = XLSX.utils.json_to_sheet(exportData, {
        header: EXPORT_COLUMNS.map((column) => column.label),
      });

      worksheet["!cols"] = EXPORT_COLUMNS.map((column) => {
        const longest = data.reduce((max, row) => {
          const text = row[column.key as keyof typeof row];
          return Math.max(max, String(text ?? "").length);
        }, column.label.length);
        return { wch: Math.min(Math.max(longest + 2, 10), 60) };
      });

      const lastCol = XLSX.utils.encode_col(EXPORT_COLUMNS.length - 1);
      worksheet["!autofilter"] = { ref: `A1:${lastCol}${exportData.length + 1}` };

      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Export");
      XLSX.writeFile(workbook, `stock-matiere-premiere-${new Date().toISOString().slice(0, 10)}.xlsx`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur pendant l'export.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={handleExport}
        disabled={loading}
        aria-label="Exporter en Excel"
        title="Exporter en Excel"
        className="flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 text-slate-700 hover:border-slate-400 disabled:opacity-50"
      >
        {loading ? (
          <span className="text-xs font-semibold text-slate-500">...</span>
        ) : (
          <svg viewBox="0 0 24 24" className="h-6 w-6">
            <rect x="2" y="2" width="20" height="20" rx="3" fill="#1D6F42" />
            <path
              d="M7 7.5 10.6 12 7 16.5h2.1L11.6 13l2.5 3.5h2.1L12.6 12l3.6-4.5h-2.1l-2.5 3.4-2.5-3.4H7Z"
              fill="#ffffff"
            />
          </svg>
        )}
      </button>
      {error ? <p className="text-xs font-semibold text-red-700">{error}</p> : null}
    </div>
  );
}
