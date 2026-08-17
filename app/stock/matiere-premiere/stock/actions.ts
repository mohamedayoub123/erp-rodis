"use server";

import { supabaseServer } from "@/lib/supabase-server";

export type StockMpExportFilters = {
  q: string;
  codeQ: string;
  dateFrom: string;
  dateTo: string;
  monthFrom: number;
  monthTo: number;
  year: number;
  hideZero: boolean;
};

type StockMpExportRow = {
  date_jour: string | null;
  nom_article: string | null;
  mouvement_type: "entree" | "sortie";
  categorie: string | null;
  gamme: string | null;
  numero_lot: string | null;
  unite: string | null;
  date_fabrication: string | null;
  date_expiration: string | null;
  qte_entree: number;
  qte_sortie: number;
  stock_code: number;
  stock_article: number;
  fournisseur: string | null;
  client: string | null;
  n_doss_erp: string | null;
  n_doss_4d: string | null;
  note: string | null;
  utilisateur: string | null;
  created_at: string | null;
};

// Reprend le meme filtre que la page (RPC stock_mp_display_rows), mais SANS
// la pagination d'affichage (200/page) - appelee uniquement au clic sur
// "Exporter" (jamais au chargement normal de la page), pour ne pas ramener
// des dizaines de milliers de lignes a chaque ouverture de la page.
export async function fetchStockMpExportRowsAction(filters: StockMpExportFilters) {
  const rows: StockMpExportRow[] = [];
  let offset = 0;
  const pageSize = 1000;

  while (true) {
    const { data, error } = await supabaseServer.rpc("stock_mp_display_rows", {
      p_article_q: filters.q || null,
      p_code_q: filters.codeQ || null,
      p_date_from: filters.dateFrom || null,
      p_date_to: filters.dateTo || null,
      p_month_from: filters.monthFrom || null,
      p_month_to: filters.monthTo || null,
      p_year: filters.year || null,
      p_hide_zero: filters.hideZero,
      p_limit: pageSize,
      p_offset: offset,
    });

    if (error) {
      throw new Error(error.message);
    }

    const chunk = (data as StockMpExportRow[] | null) ?? [];
    rows.push(...chunk);

    if (chunk.length < pageSize) break;
    offset += pageSize;
  }

  return rows;
}
