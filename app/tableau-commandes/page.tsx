import Link from "next/link";
import { supabaseServer } from "@/lib/supabase-server";
import { unstable_noStore as noStore } from "next/cache";
import { BackButton } from "@/app/_components/back-button";
import { RefreshButton } from "@/app/_components/refresh-button";
import { canWritePageUser, getCurrentStockUser } from "@/lib/stock-auth";
import { HighlightableRow } from "./highlightable-row";
import { ToutesFamillesExportButton } from "./export-toutes-familles-button";
import { CommandeNoteCell } from "./note-cell";
import {
  TableauExportButton,
  type ExportCommandColumn,
  type ExportDataRow,
} from "./tableau-export-button";
import {
  FAMILY_ORDER,
  FAMILY_BUTTON_STYLES,
  fetchDynamicFamilies,
} from "./family-lib";
import {
  EMPTY_TABLE_FAMILIES,
  buildFamilyView,
  getStatusLabel,
  loadFamilyTableData,
  normalizeArticle,
  type CommandColumn,
} from "./family-data";
import { loadManquantData, type ManquantFamilySection } from "./manquant-data";

// Le bouton "Exporter toutes les familles" calcule tout le tableau (toutes les familles + la feuille
// Article manquant) dans une action serveur de cette page : on lui laisse le temps.
export const maxDuration = 60;

type SearchParams = Promise<{
  famille?: string;
  hideStand?: string;
  vue?: string;
  negatif?: string;
}>;

const WHITE_SECRET_TURQUOISE = "bg-[#1f9da5]";

const WHITE_SECRET_CLIENT_COLUMNS = [
  { client: "RODIS MALI", color: "bg-[#14989d] text-slate-950", stand: false },
  { client: "BAJEN SHEA BUTTER", color: "bg-[#ffe01b] text-slate-950", stand: false },
  { client: "HOME TECHNOLOGIE", color: "bg-[#ffe01b] text-slate-950", stand: false },
  { client: "AZA GLOBAL IMPEX", color: "bg-[#ffe01b] text-slate-950", stand: false },
  { client: "KONE GABON", color: "bg-[#12b44b] text-slate-950", stand: false },
  { client: "CAPTIN CAMEROUN", color: "bg-[#f6c32e] text-slate-950", stand: true },
  { client: "BAJEN SHEA BUTTER", color: "bg-[#ffe01b] text-slate-950", stand: false },
  { client: "NASS MAMEK ABA", color: "bg-[#12b44b] text-slate-950", stand: false },
  { client: "IPP SARL", color: "bg-[#12b44b] text-slate-950", stand: false },
  { client: "TAIF PARFUMERIE", color: "bg-[#12b44b] text-slate-950", stand: false },
  { client: "WABRO S", color: "bg-[#ffe01b] text-slate-950", stand: false },
  { client: "AL RACHID GENERAL BUSINESS", color: "bg-[#f6c32e] text-slate-950", stand: true },
  { client: "STRICKER JUBA", color: "bg-[#f6c32e] text-slate-950", stand: true },
  { client: "HOME TECHNOLOGIE", color: "bg-[#f6c32e] text-slate-950", stand: true },
  { client: "AMA TCHAD", color: "bg-[#f6c32e] text-slate-950", stand: false },
  { client: "SOCIETE PARAPHARM", color: "bg-[#ffe01b] text-slate-950", stand: false },
  { client: "MOHAMED SIMPARA MALI", color: "bg-[#ffe01b] text-slate-950", stand: false },
  { client: "RABS BURKINA", color: "bg-[#12b44b] text-slate-950", stand: false },
];

const WHITE_SECRET_EXTRA_EMPTY_COLUMNS = 12;

function formatDateCell(date: Date) {
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = date.getFullYear();
  return `${day}-${month}-${year}`;
}

function formatQuantity(value: number) {
  return new Intl.NumberFormat("fr-FR", {
    maximumFractionDigits: 0,
  }).format(Number(value || 0));
}

type StockArticleSourceRow = {
  id?: number | null;
  article_id?: number | null;
  date_jour?: string | null;
  qte_entree: number | null;
  qte_sortie: number | null;
  articles?:
    | { nom_article: string | null; gamme?: string | null }
    | { nom_article: string | null; gamme?: string | null }[]
    | null;
};

function buildCurrentStockByArticle(
  rows: StockArticleSourceRow[],
  allowedArticleKeys?: Set<string>,
  articleNameById?: Map<number, string>
) {
  const currentByArticle = new Map<string, number>();

  for (const row of rows) {
    const articleId = Number(row.article_id ?? 0);
    const relation = row.articles;
    const article = Array.isArray(relation) ? relation[0] : relation;
    const articleName =
      (articleId && articleNameById?.get(articleId)) || String(article?.nom_article || "");
    const articleKey = normalizeArticle(articleName);

    if (!articleKey) continue;
    if (allowedArticleKeys && !allowedArticleKeys.has(articleKey)) continue;

    const mouvement = Number(row.qte_entree ?? 0) - Number(row.qte_sortie ?? 0);
    currentByArticle.set(
      articleKey,
      Number(currentByArticle.get(articleKey) ?? 0) + mouvement
    );
  }

  return currentByArticle;
}

async function fetchAllLotsStockForArticleIds(articleIds: number[]) {
  const validIds = [...new Set(articleIds.filter((value) => value > 0))];

  if (validIds.length === 0) {
    return [] as {
      article_id: number | null;
      qte_entree: number | null;
      qte_sortie: number | null;
    }[];
  }

  const rows: {
    article_id: number | null;
    qte_entree: number | null;
    qte_sortie: number | null;
  }[] = [];

  let from = 0;
  const pageSize = 1000;

  while (true) {
    const { data, error } = await supabaseServer
      .from("lots_stock")
      .select("article_id, qte_entree, qte_sortie")
      .in("article_id", validIds)
      .range(from, from + pageSize - 1);

    if (error) {
      throw new Error(error.message);
    }

    const chunk = data ?? [];
    rows.push(...chunk);

    if (chunk.length < pageSize) {
      break;
    }

    from += pageSize;
  }

  return rows;
}

function formatTruckCount(value: number | null) {
  if (value === null || Number.isNaN(Number(value))) return "";
  const num = Number(value);
  return Number.isInteger(num) ? String(num) : String(num).replace(".", ",");
}

function getStatusCellClass(statusValue: string | null | undefined) {
  const status = String(statusValue || "").toUpperCase();
  if (status === "STAND") return "bg-[#f59e0b] text-slate-950";
  if (status === "BL_TRANSFORME") return "bg-[#16a34a] text-slate-950";
  return "bg-[#fff200] text-slate-900";
}

function renderArticleManquantInsideTableau(
  families: string[],
  availableFamilies: string[],
  selectedFamille: string,
  commandColumns: CommandColumn[],
  sections: ManquantFamilySection[],
  qtEnCoursConditionnementByArticleKey: Map<string, number>,
  hideStand: boolean = false,
  onlyNegatif: boolean = false,
  canEditNote: boolean = false
) {
  const visibleCommandColumns = commandColumns.filter(
    (column) => !hideStand || String(column.statut || "").toUpperCase() !== "STAND"
  );

  // Total/reste recalcule en excluant les commandes Stand quand le bouton
  // "Supprimer stand" est actif - une ligne qui n'est en manque qu'a cause
  // du Stand ne doit plus apparaitre du tout dans la liste. "Voir seulement
  // les manques" affine encore : ne garde que les articles dont le manque
  // reste reel meme apres avoir ajoute ce qui est deja en cours de
  // Conditionnement (demande explicite).
  const visibleSections = sections
    .map(({ family, rows }) => ({
      family,
      rows: rows
        .map((row) => {
          const totalCommande = visibleCommandColumns.reduce(
            (sum, column) => sum + Number(row.quantitiesByCommand.get(column.key) ?? 0),
            0
          );
          const reste = row.stock - totalCommande;
          const qtEnCours = Number(qtEnCoursConditionnementByArticleKey.get(normalizeArticle(row.article)) ?? 0);
          return { ...row, totalCommande, reste, resteApresConditionnement: reste + qtEnCours };
        })
        .filter((row) => row.reste < 0 && (!onlyNegatif || row.resteApresConditionnement < 0)),
    }))
    .filter((section) => section.rows.length > 0);

  const familiesEnManque = visibleSections.length;
  const articlesEnManque = visibleSections.reduce((sum, section) => sum + section.rows.length, 0);
  const totalManque = visibleSections.reduce(
    (sum, section) => sum + section.rows.reduce((rowSum, row) => rowSum + Math.abs(row.reste), 0),
    0
  );

  // Meme donnees, meme formules que le rendu ecran juste en dessous -
  // aplaties en objets simples pour l'export Excel (bouton place dans
  // l'en-tete de la page).
  const exportCommandColumns: ExportCommandColumn[] = visibleCommandColumns.map((column) => ({
    key: column.key,
    client: column.client,
    nombreCamion: column.nombre_camion,
    numeroProforma: column.numero_proforma,
    dateEcriture: column.date_ecriture,
    statut: getStatusLabel(column.statut),
    statutCode: String(column.statut || ""),
    note: column.note,
  }));

  const exportRows: ExportDataRow[] = visibleSections.flatMap(({ family, rows }) => {
    const familyRows: ExportDataRow[] = [{ kind: "banner", label: family }];
    for (const row of rows) {
      const quantitiesByColumn: Record<string, number> = {};
      for (const column of visibleCommandColumns) {
        quantitiesByColumn[column.key] = Number(row.quantitiesByCommand.get(column.key) ?? 0);
      }
      const qtEnCours = Number(qtEnCoursConditionnementByArticleKey.get(normalizeArticle(row.article)) ?? 0);
      familyRows.push({
        kind: "article",
        article: row.article,
        quantitiesByColumn,
        total: row.totalCommande,
        stock: row.stock,
        reste: row.reste,
        qtEnCours,
        resteApresConditionnement: row.resteApresConditionnement,
      });
    }
    return familyRows;
  });

  return (
    <main className="min-h-screen bg-[#f4f6f8] px-4 py-6 text-slate-900 lg:px-6">
      <div className="mx-auto w-full space-y-5">
        <section className="rounded-[1.75rem] border border-slate-200 bg-white px-6 py-5 shadow-[0_12px_30px_rgba(15,23,42,0.06)]">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.22em] text-[#b95b16]">
                ERP Rodis
              </p>
              <h1 className="mt-1 text-3xl font-medium tracking-tight">Tableau de commande</h1>
              <p className="mt-2 text-sm text-slate-600">
                Recap de toutes les gammes avec tous les articles, reste negatif surligne en jaune.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <Link
                href="/tableau-commandes"
                className="rounded-full border border-slate-200 px-4 py-2 text-[16px] font-medium text-slate-700"
              >
                Familles
              </Link>
              <Link
                href="/tableau-commandes?vue=manquant"
                className="rounded-full bg-red-700 px-4 py-2 text-[16px] font-medium text-white"
              >
                Article manquant
              </Link>
              <Link
                href="/tableau-commandes/articles-sans-gamme"
                className="rounded-full bg-amber-600 px-4 py-2 text-[16px] font-medium text-white"
              >
                Gerer les gammes
              </Link>
              <Link
                href="/commandes"
                className="rounded-full bg-slate-950 px-4 py-2 text-[16px] font-medium text-white"
              >
                Commandes
              </Link>
              <TableauExportButton
                title={selectedFamille ? `Article manquant - ${selectedFamille}` : "Article manquant"}
                commandColumns={exportCommandColumns}
                rows={exportRows}
                fileName={`article-manquant-${selectedFamille || "toutes-familles"}-${formatDateCell(new Date())}.xlsx`}
              />
              <form action="/tableau-commandes">
                <input type="hidden" name="vue" value="manquant" />
                {selectedFamille ? <input type="hidden" name="famille" value={selectedFamille} /> : null}
                {hideStand ? null : <input type="hidden" name="hideStand" value="1" />}
                {onlyNegatif ? <input type="hidden" name="negatif" value="1" /> : null}
                <button
                  type="submit"
                  className="rounded-full border border-amber-200 bg-amber-50 px-4 py-2 text-[16px] font-medium text-amber-800"
                >
                  {hideStand ? "Afficher stand" : "Supprimer stand"}
                </button>
              </form>
              <form action="/tableau-commandes">
                <input type="hidden" name="vue" value="manquant" />
                {selectedFamille ? <input type="hidden" name="famille" value={selectedFamille} /> : null}
                {hideStand ? <input type="hidden" name="hideStand" value="1" /> : null}
                {onlyNegatif ? null : <input type="hidden" name="negatif" value="1" />}
                <button
                  type="submit"
                  className="rounded-full border border-red-200 bg-red-50 px-4 py-2 text-[16px] font-medium text-red-800"
                >
                  {onlyNegatif ? "Voir tout" : "Voir seulement les manques"}
                </button>
              </form>
            </div>
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-3">
          <div className="rounded-[1.5rem] border border-slate-200 bg-white px-5 py-4 shadow-[0_12px_30px_rgba(15,23,42,0.06)]">
            <p className="text-[16px] font-medium uppercase tracking-[0.24em] text-slate-500">Familles en manque</p>
            <p className="mt-2 text-3xl font-medium text-slate-950">{familiesEnManque}</p>
          </div>
          <div className="rounded-[1.5rem] border border-slate-200 bg-white px-5 py-4 shadow-[0_12px_30px_rgba(15,23,42,0.06)]">
            <p className="text-[16px] font-medium uppercase tracking-[0.24em] text-slate-500">Articles manquants</p>
            <p className="mt-2 text-3xl font-medium text-slate-950">{articlesEnManque}</p>
          </div>
          <div className="rounded-[1.5rem] border border-slate-200 bg-white px-5 py-4 shadow-[0_12px_30px_rgba(15,23,42,0.06)]">
            <p className="text-[16px] font-medium uppercase tracking-[0.24em] text-slate-500">Total manque</p>
            <p className="mt-2 text-3xl font-medium text-red-700">{formatQuantity(totalManque)}</p>
          </div>
        </section>

        <section className="rounded-[1.75rem] border border-slate-200 bg-white px-5 py-5 shadow-[0_12px_30px_rgba(15,23,42,0.06)]">
          <div className="flex flex-wrap gap-2">
            <Link
              href="/tableau-commandes?vue=manquant"
              className={
                selectedFamille
                  ? "rounded-xl bg-slate-100 px-4 py-2 text-[16px] font-medium leading-none text-slate-700 shadow-sm transition hover:scale-[1.02] hover:opacity-90"
                  : "rounded-xl bg-slate-950 px-4 py-2 text-[16px] font-medium leading-none text-white shadow-sm transition hover:scale-[1.02] hover:opacity-90"
              }
            >
              Tous
            </Link>
            {availableFamilies.map((family) => {
              const buttonStyle = FAMILY_BUTTON_STYLES[family] || "bg-slate-200 text-slate-950";
              const active = family === selectedFamille;

              return (
                <Link
                  key={family}
                  href={`/tableau-commandes?vue=manquant&famille=${encodeURIComponent(family)}`}
                  className={`rounded-xl px-4 py-2 text-[16px] font-medium leading-none shadow-sm transition hover:scale-[1.02] hover:opacity-90 ${buttonStyle} ${active ? "ring-2 ring-slate-950/30" : ""}`}
                >
                  {family}
                </Link>
              );
            })}
          </div>
        </section>

        <section className="rounded-[1.75rem] border border-slate-200 bg-white px-5 py-5 shadow-[0_12px_30px_rgba(15,23,42,0.06)]">
          {visibleSections.length === 0 ? (
            <div className="rounded-[1.5rem] border border-emerald-200 bg-emerald-50 px-5 py-6 text-center text-[16px] font-medium text-emerald-900">
              Aucun article manquant pour le filtre actuel.
            </div>
          ) : (
            <div className="overflow-hidden rounded-[1.35rem] border border-slate-300 bg-white shadow-[0_8px_24px_rgba(15,23,42,0.05)]">
              <div className="max-h-[75vh] overflow-auto">
                <table className="min-w-[1660px] w-full border-separate border-spacing-0 text-[16px]">
                  <colgroup>
                    <col style={{ width: "280px" }} />
                    {visibleCommandColumns.length > 0 ? (
                      visibleCommandColumns.map((column) => (
                        <col key={`manquant-col-${column.key}`} style={{ width: "52px" }} />
                      ))
                    ) : (
                      <col style={{ width: "120px" }} />
                    )}
                    <col style={{ width: "64px" }} />
                    <col style={{ width: "64px" }} />
                    <col style={{ width: "64px" }} />
                    <col style={{ width: "84px" }} />
                    <col style={{ width: "84px" }} />
                  </colgroup>
                  {/* Toute la thead colle en UN seul bloc (au lieu d'une
                  sticky top-[Npx] par ligne) - les offsets en pixels fixes
                  ne correspondaient pas toujours a la hauteur reelle des
                  lignes (texte client qui passe sur 2 lignes...), ce qui
                  laissait un filet blanc entre 2 lignes d'en-tete au clic
                  (bug reel signale). Sticky sur la thead entiere empile les
                  lignes normalement, sans calcul de decalage a maintenir. */}
                  <thead className="sticky top-0 z-40">
                    <tr>
                      <th className={`sticky left-0 z-60 border border-slate-700 ${WHITE_SECRET_TURQUOISE} px-3 py-2 text-left font-medium uppercase text-slate-950`}>
                        Note
                      </th>
                      {visibleCommandColumns.map((column) => (
                        <th
                          key={`note-${column.key}`}
                          className={`border border-slate-700 ${WHITE_SECRET_TURQUOISE} px-1 py-1 text-center text-[16px] font-medium normal-case text-slate-950`}
                        >
                          <CommandeNoteCell commandeId={column.id} initialValue={column.note} canEdit={canEditNote} />
                        </th>
                      ))}
                      <th rowSpan={6} className={`border border-slate-700 ${WHITE_SECRET_TURQUOISE} px-1 py-2 text-[16px] font-medium uppercase text-slate-950`}>
                        TOTAL
                      </th>
                      <th rowSpan={6} className={`border border-slate-700 ${WHITE_SECRET_TURQUOISE} px-1 py-2 text-[16px] font-medium uppercase text-slate-950`}>
                        STOCK
                      </th>
                      <th rowSpan={6} className={`border border-slate-700 ${WHITE_SECRET_TURQUOISE} px-1 py-2 text-[16px] font-medium uppercase text-slate-950`}>
                        RESTE
                      </th>
                      <th rowSpan={6} className={`border border-slate-700 ${WHITE_SECRET_TURQUOISE} px-1 py-2 text-[16px] font-medium uppercase leading-tight text-slate-950`}>
                        Qt en cours de Conditionnement
                      </th>
                      <th rowSpan={6} className={`border border-slate-700 ${WHITE_SECRET_TURQUOISE} px-1 py-2 text-[16px] font-medium uppercase leading-tight text-slate-950`}>
                        Reste apres Conditionnement
                      </th>
                    </tr>
                    <tr>
                      <th className={`sticky left-0 z-60 border border-slate-700 ${WHITE_SECRET_TURQUOISE} px-3 py-2 text-left font-medium uppercase text-slate-950`}>
                        Statut
                      </th>
                      {visibleCommandColumns.map((column) => (
                        <th
                          key={`status-${column.key}`}
                          className={`border border-slate-700 px-1 py-2 text-center text-[16px] font-medium uppercase leading-tight whitespace-normal break-words ${getStatusCellClass(column.statut)}`}
                        >
                          {getStatusLabel(column.statut)}
                        </th>
                      ))}
                    </tr>
                    <tr>
                      <th className={`sticky left-0 z-60 border border-slate-700 ${WHITE_SECRET_TURQUOISE} px-3 py-2 text-left font-medium uppercase text-slate-950`}>
                        Client
                      </th>
                      {visibleCommandColumns.map((column) => (
                        <th
                          key={`client-${column.key}`}
                          className={`border border-slate-700 px-1 py-2 text-center text-[16px] font-medium uppercase leading-tight whitespace-normal break-words ${getStatusCellClass(column.statut)}`}
                        >
                          {column.client || "-"}
                        </th>
                      ))}
                    </tr>
                    <tr>
                      <th className={`sticky left-0 z-60 border border-slate-700 ${WHITE_SECRET_TURQUOISE} px-3 py-2 text-left font-medium uppercase text-slate-950`}>
                        Nb camion
                      </th>
                      {visibleCommandColumns.map((column) => (
                        <th
                          key={`camion-${column.key}`}
                          className={`border border-slate-700 ${WHITE_SECRET_TURQUOISE} px-1 py-2 text-center text-[16px] font-medium leading-tight whitespace-normal break-words text-slate-950`}
                        >
                          {formatTruckCount(column.nombre_camion)}
                        </th>
                      ))}
                    </tr>
                    <tr>
                      <th className={`sticky left-0 z-60 border border-slate-700 ${WHITE_SECRET_TURQUOISE} px-3 py-2 text-left font-medium uppercase text-slate-950`}>
                        Proforma #
                      </th>
                      {visibleCommandColumns.map((column) => (
                        <th
                          key={`proforma-${column.key}`}
                          className={`border border-slate-700 ${WHITE_SECRET_TURQUOISE} px-1 py-2 text-center text-[16px] font-medium leading-tight whitespace-normal break-words text-slate-950`}
                        >
                          {column.numero_proforma || "-"}
                        </th>
                      ))}
                    </tr>
                    <tr>
                      <th className={`sticky left-0 z-60 border border-slate-700 ${WHITE_SECRET_TURQUOISE} px-3 py-2 text-left font-medium uppercase text-slate-950`}>
                        Date de commande
                      </th>
                      {visibleCommandColumns.map((column) => (
                        <th
                          key={`date-${column.key}`}
                          className={`border border-slate-700 ${WHITE_SECRET_TURQUOISE} px-1 py-2 text-center text-[16px] font-medium leading-tight whitespace-normal break-words text-slate-950`}
                        >
                          {column.date_ecriture ? formatDateCell(new Date(column.date_ecriture)) : "-"}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {visibleSections.flatMap(({ family, rows }) => [
                      <tr key={`banner-${family}`}>
                        <td
                          colSpan={1 + visibleCommandColumns.length + 5}
                          className={`border border-slate-700 ${WHITE_SECRET_TURQUOISE} px-4 py-2 text-left text-lg font-medium text-slate-950`}
                        >
                          {family}
                        </td>
                      </tr>,
                      ...rows.map((row) => {
                        const { totalCommande, reste, resteApresConditionnement } = row;
                        const qtEnCoursConditionnement = Number(
                          qtEnCoursConditionnementByArticleKey.get(normalizeArticle(row.article)) ?? 0
                        );
                        const resteApresConditionnementClass =
                          resteApresConditionnement < 0
                            ? "bg-red-600 text-white"
                            : "bg-emerald-600 text-white";
                        const isGreenRow = row.article.toLowerCase().includes("bl transforme");
                        const articleCellClass =
                          reste < 0
                            ? "bg-[#fff59d] text-slate-950"
                            : row.article.toLowerCase().includes("stand") ||
                                row.article.toLowerCase().includes("production")
                              ? "bg-[#ffe01b] text-slate-950"
                              : isGreenRow
                                ? "bg-[#62ff1b] text-[#0d6b0d]"
                                : `${WHITE_SECRET_TURQUOISE} text-slate-950`;
                        const lineFillClass = reste < 0 ? "bg-[#fff59d] text-slate-950" : "bg-white";
                        const summaryFillClass =
                          reste < 0 ? "bg-[#fff59d] text-red-700" : `${WHITE_SECRET_TURQUOISE} text-slate-950`;

                        return (
                          <HighlightableRow key={`${family}-${row.article}`}>
                            <td
                              className={`sticky left-0 z-20 border border-slate-300 px-2 py-1 text-left text-[16px] font-medium leading-tight whitespace-nowrap ${articleCellClass}`}
                            >
                              {row.article}
                            </td>
                            {visibleCommandColumns.map((column) => {
                              const qty = Number(row.quantitiesByCommand.get(column.key) ?? 0);
                              return (
                                <td
                                  key={`${family}-${row.article}-${column.key}`}
                                  className={`border border-slate-300 px-1 py-1 font-medium leading-tight whitespace-normal break-words ${lineFillClass}`}
                                >
                                  {qty > 0 ? formatQuantity(qty) : ""}
                                </td>
                              );
                            })}
                            <td className={`border border-slate-700 px-2 py-1 text-center font-medium ${summaryFillClass}`}>
                              {formatQuantity(totalCommande)}
                            </td>
                            <td className={`border border-slate-700 px-2 py-1 text-center font-medium ${summaryFillClass}`}>
                              {formatQuantity(row.stock)}
                            </td>
                            <td className={`border border-slate-700 px-2 py-1 text-center font-medium ${summaryFillClass}`}>
                              {formatQuantity(reste)}
                            </td>
                            <td className={`border border-slate-700 px-2 py-1 text-center font-medium ${summaryFillClass}`}>
                              {qtEnCoursConditionnement > 0 ? formatQuantity(qtEnCoursConditionnement) : ""}
                            </td>
                            <td className={`border border-slate-700 px-2 py-1 text-center font-medium ${resteApresConditionnementClass}`}>
                              {formatQuantity(resteApresConditionnement)}
                            </td>
                          </HighlightableRow>
                        );
                      }),
                    ])}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

function renderGenericFamilyTemplate(
  families: string[],
  selectedFamille: string,
  articleRows: string[],
  commandColumns: CommandColumn[],
  quantitiesByArticle: Map<string, Map<string, number>>,
  stockByArticle: Map<string, number>,
  qtEnCoursConditionnementByArticleKey: Map<string, number>,
  subGammeByArticleKey?: Map<string, { label: string; bannerClass: string }>,
  hideStand: boolean = false,
  onlyNegatif: boolean = false,
  canEditNote: boolean = false
) {
  // Lignes du tableau + lignes d'export Excel : meme calcul que l'export de
  // toutes les familles (voir buildFamilyView dans family-data.ts).
  const { visibleCommandColumns, rowsWithSubGamme, exportCommandColumns, exportRows } = buildFamilyView(
    articleRows,
    commandColumns,
    quantitiesByArticle,
    stockByArticle,
    qtEnCoursConditionnementByArticleKey,
    subGammeByArticleKey,
    hideStand,
    onlyNegatif
  );

  return (
    <main className="min-h-screen bg-[#f4f6f8] px-4 py-6 text-slate-900 lg:px-6">
      <div className="mx-auto w-full space-y-4">
        <section className="rounded-[1.5rem] border border-slate-200 bg-white px-5 py-4 shadow-[0_12px_30px_rgba(15,23,42,0.06)]">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.22em] text-[#b95b16]">
                ERP Rodis
              </p>
              <h1 className="mt-1 text-3xl font-medium tracking-tight">{selectedFamille}</h1>
              <p className="mt-2 text-sm text-slate-600">
                Tableau automatique de la famille.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <BackButton href="/tableau-commandes" label="Retour aux familles" />
              <RefreshButton />
              <Link
                href="/tableau-commandes?vue=manquant"
                className="rounded-full bg-red-700 px-4 py-2 text-[16px] font-medium text-white"
              >
                Article manquant
              </Link>
              <TableauExportButton
                title={selectedFamille}
                commandColumns={exportCommandColumns}
                rows={exportRows}
                fileName={`tableau-commande-${selectedFamille}-${formatDateCell(new Date())}.xlsx`}
              />
              <ToutesFamillesExportButton />
              <form action="/tableau-commandes">
                <input type="hidden" name="famille" value={selectedFamille} />
                {hideStand ? null : <input type="hidden" name="hideStand" value="1" />}
                {onlyNegatif ? <input type="hidden" name="negatif" value="1" /> : null}
                <button
                  type="submit"
                  className="rounded-full border border-amber-200 bg-amber-50 px-4 py-2 text-[16px] font-medium text-amber-800"
                >
                  {hideStand ? "Afficher stand" : "Supprimer stand"}
                </button>
              </form>
              <form action="/tableau-commandes">
                <input type="hidden" name="famille" value={selectedFamille} />
                {hideStand ? <input type="hidden" name="hideStand" value="1" /> : null}
                {onlyNegatif ? null : <input type="hidden" name="negatif" value="1" />}
                <button
                  type="submit"
                  className="rounded-full border border-red-200 bg-red-50 px-4 py-2 text-[16px] font-medium text-red-800"
                >
                  {onlyNegatif ? "Voir tout" : "Voir seulement les manques"}
                </button>
              </form>
            </div>
          </div>
        </section>

        <section className="rounded-[1.5rem] border border-slate-200 bg-white px-4 py-4 shadow-[0_12px_30px_rgba(15,23,42,0.06)]">
          <div className="flex flex-wrap gap-2">
            <Link
              href="/tableau-commandes?vue=manquant"
              className="rounded-md bg-red-700 px-3 py-1.5 text-sm font-bold leading-none text-white shadow-sm transition hover:opacity-90"
            >
              Article manquant
            </Link>
            {families.map((family) => {
              const isActive = family === selectedFamille;
              const buttonStyle = FAMILY_BUTTON_STYLES[family] || "bg-slate-200 text-slate-950";

              return (
                <Link
                  key={family}
                  href={`/tableau-commandes?famille=${encodeURIComponent(family)}`}
                  className={`rounded-md px-3 py-1.5 text-sm font-bold leading-none shadow-sm transition hover:opacity-90 ${buttonStyle} ${
                    isActive ? "ring-2 ring-slate-950/30" : ""
                  }`}
                >
                  {family}
                </Link>
              );
            })}
          </div>
        </section>

        <section className="overflow-hidden rounded-[1.5rem] border border-slate-300 bg-white shadow-[0_12px_30px_rgba(15,23,42,0.06)]">
          <div className="max-h-[75vh] overflow-auto">
            <table className="min-w-[2260px] w-full border-separate border-spacing-0 text-center text-[17px]">
              <colgroup>
                <col style={{ width: "280px" }} />
                {visibleCommandColumns.length > 0 ? (
                  visibleCommandColumns.map((column) => (
                    <col key={`col-${column.key}`} style={{ width: "44px" }} />
                  ))
                ) : (
                  <col style={{ width: "120px" }} />
                )}
                <col style={{ width: "64px" }} />
                <col style={{ width: "64px" }} />
                <col style={{ width: "64px" }} />
                <col style={{ width: "84px" }} />
                <col style={{ width: "84px" }} />
              </colgroup>
              <thead>
                <tr>
                  <th className="border border-slate-700 bg-white px-3 py-2 text-left text-[16px] font-medium uppercase text-slate-950">
                    Note
                  </th>
                  {commandColumns.length > 0 ? (
                    visibleCommandColumns.map((column) => (
                      <th
                        key={`note-${column.key}`}
                        className={`border border-slate-700 ${WHITE_SECRET_TURQUOISE} px-1 py-1 text-center text-[16px] font-medium normal-case text-slate-950`}
                      >
                        <CommandeNoteCell commandeId={column.id} initialValue={column.note} canEdit={canEditNote} />
                      </th>
                    ))
                  ) : (
                    <th className={`border border-slate-700 ${WHITE_SECRET_TURQUOISE} px-2 py-2`} />
                  )}
                  <th className={`border border-slate-700 ${WHITE_SECRET_TURQUOISE} px-2 py-2`} />
                  <th className={`border border-slate-700 ${WHITE_SECRET_TURQUOISE} px-2 py-2`} />
                  <th className={`border border-slate-700 ${WHITE_SECRET_TURQUOISE} px-2 py-2`} />
                  <th className={`border border-slate-700 ${WHITE_SECRET_TURQUOISE} px-2 py-2`} />
                  <th className={`border border-slate-700 ${WHITE_SECRET_TURQUOISE} px-2 py-2`} />
                </tr>
                <tr>
                  <th className="border border-slate-700 bg-white px-3 py-2 text-left text-xl font-medium text-slate-900">
                    {formatDateCell(new Date())}
                  </th>
                  <th
                    colSpan={Math.max(commandColumns.length, 1) + 5}
                    className={`border border-slate-700 ${WHITE_SECRET_TURQUOISE} px-3 py-2 text-center text-lg font-medium text-slate-950`}
                  >
                    {selectedFamille}
                  </th>
                </tr>
                <tr>
                  <th className="border border-slate-700 bg-[#62ff1b] px-2 py-1 text-center text-[16px] font-medium uppercase leading-4 text-[#0d6b0d]">
                    &nbsp;
                  </th>
                  {commandColumns.length > 0 ? (
                    visibleCommandColumns.map((column) => {
                      return (
                        <th
                          key={`status-${column.key}`}
                          className={`border border-slate-700 ${WHITE_SECRET_TURQUOISE} px-1 py-2 whitespace-normal break-words`}
                        >
                          <span
                            className={`inline-block rounded-sm px-3 py-1 text-[16px] font-medium uppercase ${getStatusCellClass(column.statut)}`}
                          >
                            {getStatusLabel(column.statut)}
                          </span>
                        </th>
                      );
                    })
                  ) : (
                    <th className={`border border-slate-700 ${WHITE_SECRET_TURQUOISE} px-2 py-2`} />
                  )}
                  <th className={`border border-slate-700 ${WHITE_SECRET_TURQUOISE} px-2 py-2 font-medium text-slate-950`} />
                  <th className={`border border-slate-700 ${WHITE_SECRET_TURQUOISE} px-2 py-2 font-medium text-slate-950`} />
                  <th className={`border border-slate-700 ${WHITE_SECRET_TURQUOISE} px-2 py-2 font-medium text-slate-950`} />
                  <th className={`border border-slate-700 ${WHITE_SECRET_TURQUOISE} px-2 py-2 font-medium text-slate-950`} />
                  <th className={`border border-slate-700 ${WHITE_SECRET_TURQUOISE} px-2 py-2 font-medium text-slate-950`} />
                </tr>
                <tr>
                  <th className={`border border-slate-700 ${WHITE_SECRET_TURQUOISE} px-3 py-3 font-medium text-slate-950`}>
                    Client
                  </th>
                  {commandColumns.length > 0 ? (
                    visibleCommandColumns.map((column) => (
                      <th
                        key={`client-${column.key}`}
                        className={`border border-slate-700 px-1 py-3 text-[16px] font-medium uppercase leading-tight whitespace-normal break-words ${getStatusCellClass(column.statut)}`}
                      >
                        {column.client || "\u00A0"}
                      </th>
                    ))
                  ) : (
                    <th className={`border border-slate-700 ${WHITE_SECRET_TURQUOISE} px-2 py-3`} />
                  )}
                  <th className={`border border-slate-700 ${WHITE_SECRET_TURQUOISE} px-1 py-3 text-[16px] font-medium uppercase leading-tight whitespace-normal break-words text-slate-950`}>
                    TOTAL
                  </th>
                  <th className={`border border-slate-700 ${WHITE_SECRET_TURQUOISE} px-1 py-3 text-[16px] font-medium uppercase leading-tight whitespace-normal break-words text-slate-950`}>
                    STOCK
                  </th>
                  <th className={`border border-slate-700 ${WHITE_SECRET_TURQUOISE} px-1 py-3 text-[16px] font-medium uppercase leading-tight whitespace-normal break-words text-slate-950`}>
                    RESTE
                  </th>
                  <th className={`border border-slate-700 ${WHITE_SECRET_TURQUOISE} px-1 py-3 text-[16px] font-medium uppercase leading-tight whitespace-normal break-words text-slate-950`}>
                    Qt en cours de Conditionnement
                  </th>
                  <th className={`border border-slate-700 ${WHITE_SECRET_TURQUOISE} px-1 py-3 text-[16px] font-medium uppercase leading-tight whitespace-normal break-words text-slate-950`}>
                    Reste apres Conditionnement
                  </th>
                </tr>
                <tr>
                  <th className={`border border-slate-700 ${WHITE_SECRET_TURQUOISE} px-3 py-2 font-medium uppercase text-slate-950`}>
                    NOMBRE DE CAMION
                  </th>
                  {commandColumns.length > 0 ? (
                    visibleCommandColumns.map((column) => (
                      <th
                        key={`truck-${column.key}`}
                        className={`border border-slate-700 ${WHITE_SECRET_TURQUOISE} px-1 py-2 text-[16px] whitespace-normal break-words`}
                      >
                        {formatTruckCount(column.nombre_camion)}
                      </th>
                    ))
                  ) : (
                    <th className={`border border-slate-700 ${WHITE_SECRET_TURQUOISE} px-2 py-2`} />
                  )}
                  <th className={`border border-slate-700 ${WHITE_SECRET_TURQUOISE} px-2 py-2`} />
                  <th className={`border border-slate-700 ${WHITE_SECRET_TURQUOISE} px-2 py-2`} />
                  <th className={`border border-slate-700 ${WHITE_SECRET_TURQUOISE} px-2 py-2`} />
                  <th className={`border border-slate-700 ${WHITE_SECRET_TURQUOISE} px-2 py-2`} />
                  <th className={`border border-slate-700 ${WHITE_SECRET_TURQUOISE} px-2 py-2`} />
                </tr>
                <tr>
                  <th className={`border border-slate-700 ${WHITE_SECRET_TURQUOISE} px-3 py-2 font-medium uppercase text-slate-950`}>
                    tC
                  </th>
                  {commandColumns.length > 0 ? (
                    visibleCommandColumns.map((column) => (
                      <th
                        key={`tc-${column.key}`}
                        className={`border border-slate-700 ${WHITE_SECRET_TURQUOISE} px-1 py-2 text-[16px] whitespace-normal break-words`}
                      >
                        {column.mode_chargement || "\u00A0"}
                      </th>
                    ))
                  ) : (
                    <th className={`border border-slate-700 ${WHITE_SECRET_TURQUOISE} px-2 py-2`} />
                  )}
                  <th className={`border border-slate-700 ${WHITE_SECRET_TURQUOISE} px-2 py-2`} />
                  <th className={`border border-slate-700 ${WHITE_SECRET_TURQUOISE} px-2 py-2`} />
                  <th className={`border border-slate-700 ${WHITE_SECRET_TURQUOISE} px-2 py-2`} />
                  <th className={`border border-slate-700 ${WHITE_SECRET_TURQUOISE} px-2 py-2`} />
                  <th className={`border border-slate-700 ${WHITE_SECRET_TURQUOISE} px-2 py-2`} />
                </tr>
                <tr>
                  <th className={`border border-slate-700 ${WHITE_SECRET_TURQUOISE} px-3 py-2 font-medium text-slate-950`}>
                    Proforma #
                  </th>
                  {commandColumns.length > 0 ? (
                    visibleCommandColumns.map((column) => (
                      <th
                        key={`proforma-${column.key}`}
                        className={`border border-slate-700 ${WHITE_SECRET_TURQUOISE} px-1 py-2 text-[16px] font-medium leading-tight whitespace-normal break-words text-slate-950`}
                      >
                        {column.numero_proforma || "-"}
                      </th>
                    ))
                  ) : (
                    <th className={`border border-slate-700 ${WHITE_SECRET_TURQUOISE} px-2 py-2`} />
                  )}
                  <th className={`border border-slate-700 ${WHITE_SECRET_TURQUOISE} px-2 py-2`} />
                  <th className={`border border-slate-700 ${WHITE_SECRET_TURQUOISE} px-2 py-2`} />
                  <th className={`border border-slate-700 ${WHITE_SECRET_TURQUOISE} px-2 py-2`} />
                  <th className={`border border-slate-700 ${WHITE_SECRET_TURQUOISE} px-2 py-2`} />
                  <th className={`border border-slate-700 ${WHITE_SECRET_TURQUOISE} px-2 py-2`} />
                </tr>
                <tr>
                  <th className={`border border-slate-700 ${WHITE_SECRET_TURQUOISE} px-3 py-2 font-medium text-slate-950`}>
                    Date commande
                  </th>
                  {commandColumns.length > 0 ? (
                    visibleCommandColumns.map((column) => (
                      <th
                        key={`date-${column.key}`}
                        className={`border border-slate-700 ${WHITE_SECRET_TURQUOISE} px-1 py-2 text-[16px] font-medium leading-tight whitespace-normal break-words text-slate-950`}
                      >
                        {column.date_ecriture ? formatDateCell(new Date(column.date_ecriture)) : "-"}
                      </th>
                    ))
                  ) : (
                    <th className={`border border-slate-700 ${WHITE_SECRET_TURQUOISE} px-2 py-2`} />
                  )}
                  <th className={`border border-slate-700 ${WHITE_SECRET_TURQUOISE} px-2 py-2`} />
                  <th className={`border border-slate-700 ${WHITE_SECRET_TURQUOISE} px-2 py-2`} />
                  <th className={`border border-slate-700 ${WHITE_SECRET_TURQUOISE} px-2 py-2`} />
                  <th className={`border border-slate-700 ${WHITE_SECRET_TURQUOISE} px-2 py-2`} />
                  <th className={`border border-slate-700 ${WHITE_SECRET_TURQUOISE} px-2 py-2`} />
                </tr>
              </thead>
              <tbody>
                {rowsWithSubGamme.flatMap(({ article, subGamme, showSubGammeBanner }) => {
                  const articleKey = normalizeArticle(article);
                  const articleQuantities = quantitiesByArticle.get(articleKey);
                  const totalCommande = visibleCommandColumns.reduce(
                    (sum, column) => sum + Number(articleQuantities?.get(column.key) ?? 0),
                    0
                  );
                  const stock = Number(stockByArticle.get(articleKey) ?? 0);
                  const reste = stock - totalCommande;
                  const qtEnCoursConditionnement = Number(
                    qtEnCoursConditionnementByArticleKey.get(articleKey) ?? 0
                  );
                  const resteApresConditionnement = reste + qtEnCoursConditionnement;
                  const resteApresConditionnementClass =
                    resteApresConditionnement < 0
                      ? "bg-red-600 text-white"
                      : "bg-emerald-600 text-white";
                  const isGreenRow = article.toLowerCase().includes("bl transforme");
                  const articleCellClass =
                    reste < 0
                      ? "bg-[#fff59d] text-slate-950"
                      : article.toLowerCase().includes("stand") || article.toLowerCase().includes("production")
                        ? "bg-[#ffe01b] text-slate-950"
                        : isGreenRow
                          ? "bg-[#62ff1b] text-[#0d6b0d]"
                          : `${WHITE_SECRET_TURQUOISE} text-slate-950`;
                  const lineFillClass = reste < 0 ? "bg-[#fff59d] text-slate-950" : "bg-white";
                  const summaryFillClass =
                    reste < 0 ? "bg-[#fff59d] text-red-700" : `${WHITE_SECRET_TURQUOISE} text-slate-950`;

                  const rows: React.ReactNode[] = [];

                  if (showSubGammeBanner && subGamme) {
                    rows.push(
                      <tr key={`subgamme-${subGamme.label}`}>
                        <td
                          colSpan={1 + visibleCommandColumns.length + 5}
                          className={`border border-slate-700 px-4 py-2 text-center text-base font-bold uppercase italic ${subGamme.bannerClass}`}
                        >
                          {subGamme.label}
                        </td>
                      </tr>
                    );
                  }

                  rows.push(
                    <HighlightableRow key={article}>
                      <td
                        className={`sticky left-0 z-20 border border-slate-300 px-2 py-1 text-left text-[16px] font-medium leading-tight whitespace-nowrap ${articleCellClass}`}
                      >
                        {article}
                      </td>
                      {visibleCommandColumns.length > 0 ? (
                        visibleCommandColumns.map((column) => {
                          const qty = Number(
                            quantitiesByArticle.get(articleKey)?.get(column.key) ?? 0
                          );

                          return (
                            <td
                              key={`${article}-${column.key}`}
                              className={`border border-slate-300 px-1 py-1 font-medium leading-tight whitespace-normal break-words ${lineFillClass}`}
                            >
                              {qty > 0 ? formatQuantity(qty) : ""}
                            </td>
                          );
                        })
                      ) : (
                        <td className={`border border-slate-300 px-1 py-1 ${lineFillClass}`} />
                      )}
                      <td className={`border border-slate-700 px-2 py-1 font-medium ${summaryFillClass}`}>
                        {formatQuantity(totalCommande)}
                      </td>
                      <td className={`border border-slate-700 px-2 py-1 font-medium ${summaryFillClass}`}>
                        {formatQuantity(stock)}
                      </td>
                      <td className={`border border-slate-700 px-2 py-1 font-medium ${summaryFillClass}`}>
                        {formatQuantity(reste)}
                      </td>
                      <td className={`border border-slate-700 px-2 py-1 font-medium ${summaryFillClass}`}>
                        {qtEnCoursConditionnement > 0 ? formatQuantity(qtEnCoursConditionnement) : ""}
                      </td>
                      <td className={`border border-slate-700 px-2 py-1 font-medium ${resteApresConditionnementClass}`}>
                        {formatQuantity(resteApresConditionnement)}
                      </td>
                    </HighlightableRow>
                  );

                  return rows;
                })}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  );
}

export default async function TableauCommandesPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  noStore();
  const currentUser = await getCurrentStockUser();
  const canEditNote = await canWritePageUser(currentUser, "commandesDetail");
  const params = await searchParams;
  const familleQuery = String(params.famille || "").trim();
  const hideStand = String(params.hideStand || "").trim() === "1";
  // Bouton "Voir seulement les manques" - ne garde que les articles dont le
  // RESTE, une fois la quantite deja en cours de Conditionnement ajoutee,
  // reste negatif (demande explicite : le manque "brut" peut deja etre
  // couvert par ce qui est en train d'etre conditionne).
  const onlyNegatif = String(params.negatif || "").trim() === "1";
  const viewQuery = String(params.vue || "").trim().toLowerCase();
  const showMissingView = viewQuery === "manquant";

  if (showMissingView) {
    const selectedFamille = familleQuery || "";
    const families = [...FAMILY_ORDER, ...(await fetchDynamicFamilies())];

    // Calcul partage avec l'export "Toutes les familles" (feuille Article manquant) : voir manquant-data.ts
    const { sharedCommandColumns, sections, qtEnCoursConditionnementByArticle } = await loadManquantData(
      families,
      selectedFamille
    );

    return renderArticleManquantInsideTableau(
      families,
      families,
      selectedFamille,
      sharedCommandColumns,
      sections,
      qtEnCoursConditionnementByArticle,
      hideStand,
      onlyNegatif,
      canEditNote
    );
  }

  // famille_besoins (l'ancien mecanisme de planning par famille) est vide en
  // base et n'alimente plus rien d'affiche - la famille/l'article y etaient
  // resolus via 2 requetes supplementaires (familles, articles) pour ne
  // finalement jamais nourrir que ce chemin mort. Retire, ca economise une
  // requete reseau complete sur CHAQUE chargement de page famille.
  const families = [...FAMILY_ORDER, ...(await fetchDynamicFamilies())];
  const selectedFamille = familleQuery || "";

  // Page d'accueil (aucune famille choisie) : n'a besoin que de la liste des
  // familles - on sort avant de lancer les requetes lourdes ci-dessous, qui
  // ne servent a rien pour cet ecran.
  if (!selectedFamille) {
    return (
      <main className="min-h-screen bg-[#f4f6f8] px-4 py-6 text-slate-900 lg:px-6">
        <div className="mx-auto w-full space-y-5">
          <section className="rounded-[1.75rem] border border-slate-200 bg-white px-6 py-5 shadow-[0_12px_30px_rgba(15,23,42,0.06)]">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.22em] text-[#b95b16]">
                  ERP Rodis
                </p>
                <h1 className="mt-1 text-3xl font-medium tracking-tight">
                  Tableau de commande
                </h1>
                <p className="mt-2 text-sm text-slate-600">
                  Choisis d&apos;abord une famille pour ouvrir son tableau.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <BackButton href="/" />
                <RefreshButton />
                <Link
                  href="/tableau-commandes?vue=manquant"
                  className="rounded-full bg-red-700 px-4 py-2 text-[16px] font-medium text-white"
                >
                  Article manquant
                </Link>
                <Link
                  href="/tableau-commandes/articles-sans-gamme"
                  className="rounded-full bg-amber-600 px-4 py-2 text-[16px] font-medium text-white"
                >
                  Gerer les gammes
                </Link>
                <ToutesFamillesExportButton />
                <Link
                  href="/commandes"
                  className="rounded-full bg-slate-950 px-4 py-2 text-[16px] font-medium text-white"
                >
                  Commandes
                </Link>
              </div>
            </div>
          </section>

        <section className="rounded-[1.75rem] border border-slate-200 bg-white px-5 py-5 shadow-[0_12px_30px_rgba(15,23,42,0.06)]">
          <div className="flex flex-wrap gap-3">
            <Link
              href="/tableau-commandes?vue=manquant"
              className="rounded-xl bg-red-700 px-4 py-2 text-[16px] font-medium leading-none text-white shadow-sm transition hover:scale-[1.02] hover:opacity-90"
            >
              Article manquant
            </Link>
            {families.map((family) => {
              const buttonStyle =
                FAMILY_BUTTON_STYLES[family] || "bg-slate-200 text-slate-950";

              return (
                <Link
                  key={family}
                  href={`/tableau-commandes?famille=${encodeURIComponent(family)}`}
                  className={`rounded-xl px-4 py-2 text-[16px] font-medium leading-none shadow-sm transition hover:scale-[1.02] hover:opacity-90 ${buttonStyle}`}
                >
                  {family}
                </Link>
              );
            })}
          </div>
        </section>
        </div>
      </main>
    );
  }

  const shouldStayEmpty = EMPTY_TABLE_FAMILIES.has(selectedFamille);

  if (shouldStayEmpty) {
    return (
      <main className="min-h-screen bg-[#f4f6f8] px-4 py-6 text-slate-900 lg:px-6">
        <div className="mx-auto w-full space-y-5">
          <section className="rounded-[1.75rem] border border-slate-200 bg-white px-6 py-5 shadow-[0_12px_30px_rgba(15,23,42,0.06)]">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.22em] text-[#b95b16]">
                  ERP Rodis
                </p>
                <h1 className="mt-1 text-3xl font-medium tracking-tight">
                  {selectedFamille}
                </h1>
                <p className="mt-2 text-sm text-slate-600">
                  Cette famille est ouverte, mais le tableau est encore vide.
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                <BackButton href="/tableau-commandes" label="Retour aux boutons" />
              </div>
            </div>
          </section>

          <section className="rounded-[1.75rem] border border-slate-200 bg-white px-5 py-6 shadow-[0_12px_30px_rgba(15,23,42,0.06)]">
            <div className="mb-5 flex flex-wrap gap-2">
              <Link
                href="/tableau-commandes?vue=manquant"
                className="rounded-md bg-red-700 px-3 py-1.5 text-sm font-bold leading-none text-white shadow-sm transition hover:opacity-90"
              >
                Article manquant
              </Link>
              {families.map((family) => {
                const isActive = family === selectedFamille;
                const buttonStyle =
                  FAMILY_BUTTON_STYLES[family] || "bg-slate-200 text-slate-950";

                return (
                  <Link
                    key={family}
                    href={`/tableau-commandes?famille=${encodeURIComponent(family)}`}
                    className={`rounded-md px-3 py-1.5 text-sm font-bold leading-none shadow-sm transition hover:opacity-90 ${buttonStyle} ${
                      isActive ? "ring-2 ring-slate-950/30" : ""
                    }`}
                  >
                    {family}
                  </Link>
                );
              })}
            </div>

            <div className="min-h-[360px] rounded-[1.5rem] border border-slate-200 bg-white" />
          </section>
        </div>
      </main>
    );
  }

  // Donnees de la famille (White Secret ou famille generique) : meme code que
  // l'export Excel de toutes les familles (voir family-data.ts).
  const tableData = await loadFamilyTableData(selectedFamille);

  return renderGenericFamilyTemplate(
    families,
    selectedFamille,
    tableData.articleRows,
    tableData.commandColumns,
    tableData.quantitiesByArticle,
    tableData.stockByArticle,
    tableData.qtEnCoursByArticleKey,
    tableData.subGammeByArticleKey,
    hideStand,
    onlyNegatif,
    canEditNote
  );
}
