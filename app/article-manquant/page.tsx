import Link from "next/link";
import { unstable_noStore as noStore } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import { canDeletePageUser, getCurrentStockUser } from "@/lib/stock-auth";
import { deleteStandFamilleBesoinsAction } from "./actions";
import { BackButton } from "@/app/_components/back-button";
import { RefreshButton } from "@/app/_components/refresh-button";
import { DeleteIconButton } from "@/app/_components/delete-icon-button";

type SearchParams = Promise<{
  famille?: string;
}>;

type PlanningRow = {
  famille: string | null;
  article: string;
  quantite_prevue: number | null;
};

type ArticleRow = {
  id: number;
  nom_article: string | null;
  gamme: string | null;
};

type StockPageRawRow = {
  id: number;
  article_id: number | null;
  numero_lot: string | null;
  date_jour: string | null;
  qte_entree: number | null;
  qte_sortie: number | null;
};

const FAMILY_ORDER = [
  "White Secret",
  "Precious Perfect",
  "Perfect Glow",
  "BB Clear",
  "BB Clear VIT C",
  "Elixir",
  "Pro White",
  "Luxury Cocoa",
  "Luxury Avocado",
  "Egyptian Beauty",
  "MOROCCO SKIN",
  "ABSOLUTE CARE REALITY",
  "REAL CARE R",
  "TONE THERAPY R",
  "MY FAMILY CARE",
  "DERMATONE",
  "Coco Clear",
  "Cocoa Skin",
  "ECO+OFA+CDV+SKL",
  "SOOPURE",
  "EDT RODIS",
  "EDT REALITY",
  "MENTHOLE ETDIVERS",
];

const FAMILY_BUTTON_STYLES: Record<string, string> = {
  "White Secret": "bg-[#ff1f1f] text-white",
  "Precious Perfect": "bg-[#7f57c2] text-white",
  "Perfect Glow": "bg-[#e0a85d] text-slate-950",
  "BB Clear": "bg-[#0dbb62] text-slate-950",
  "BB Clear VIT C": "bg-[#f3c74c] text-slate-950",
  Elixir: "bg-[#bf4fc9] text-white",
  "Pro White": "bg-[#fff137] text-slate-950",
  "Luxury Cocoa": "bg-[#b78b22] text-slate-950",
  "Luxury Avocado": "bg-[#8bc34a] text-slate-950",
  "Egyptian Beauty": "bg-[#4f78a8] text-white",
  "MOROCCO SKIN": "bg-[#ffc31a] text-slate-950",
  "ABSOLUTE CARE REALITY": "bg-[#171717] text-white",
  "REAL CARE R": "bg-[#f0f0f0] text-slate-700",
  "TONE THERAPY R": "bg-[#f7ed65] text-slate-950",
  "MY FAMILY CARE": "bg-[#6654b8] text-white",
  DERMATONE: "bg-[#d94faf] text-white",
  "Coco Clear": "bg-[#c8ecea] text-slate-950",
  "Cocoa Skin": "bg-[#bfd9a6] text-slate-950",
  "ECO+OFA+CDV+SKL": "bg-[#4f4f4f] text-white",
  SOOPURE: "bg-[#5b5b5b] text-white",
  "EDT RODIS": "bg-[#4f6174] text-white",
  "EDT REALITY": "bg-[#72839a] text-white",
  "MENTHOLE ETDIVERS": "bg-[#d9d9d9] text-slate-950",
};

function normalizeArticle(value: string) {
  return String(value || "").replace(/\u00a0/g, "").trim().toUpperCase();
}

function formatQuantity(value: number) {
  return new Intl.NumberFormat("fr-FR", {
    maximumFractionDigits: 0,
  }).format(Number(value || 0));
}

function familyMatches(gamme: string, family: string) {
  const gammeLower = String(gamme || "").toLowerCase();
  if (family === "White Secret") {
    return gammeLower.includes("white secret");
  }
  return gammeLower.includes(family.toLowerCase());
}

function computeCurrentStockLikeStockPage(rows: StockPageRawRow[]) {
  const displaySourceRows = rows.flatMap((row) => {
    const splitRows: StockPageRawRow[] = [];

    if (Number(row.qte_entree ?? 0) > 0) {
      splitRows.push({
        ...row,
        qte_sortie: 0,
      });
    }

    if (Number(row.qte_sortie ?? 0) > 0) {
      splitRows.push({
        ...row,
        qte_entree: 0,
      });
    }

    if (splitRows.length === 0) {
      splitRows.push(row);
    }

    return splitRows;
  });

  const rowsWithStock = [...displaySourceRows]
    .sort((a, b) => {
      const dateA = a.date_jour ? new Date(a.date_jour).getTime() : 0;
      const dateB = b.date_jour ? new Date(b.date_jour).getTime() : 0;

      if (dateA !== dateB) {
        return dateA - dateB;
      }

      return a.id - b.id;
    })
    .reduce<Array<StockPageRawRow & { stock_article: number }>>((acc, row) => {
      const previousArticle = row.article_id
        ? acc.filter((item) => item.article_id === row.article_id).at(-1)?.stock_article ?? 0
        : 0;

      const mouvement = Number(row.qte_entree ?? 0) - Number(row.qte_sortie ?? 0);
      const stockArticle = previousArticle + mouvement;

      acc.push({
        ...row,
        stock_article: stockArticle,
      });

      return acc;
    }, [])
    .sort((a, b) => {
      const dateA = a.date_jour ? new Date(a.date_jour).getTime() : 0;
      const dateB = b.date_jour ? new Date(b.date_jour).getTime() : 0;

      if (dateB !== dateA) {
        return dateB - dateA;
      }

      return b.id - a.id;
    });

  return Number(rowsWithStock[0]?.stock_article ?? 0);
}

async function fetchArticleStocksFromStockPage(articleRows: { id: number | null; nom_article: string | null }[]) {
  const normalizedTargets = [
    ...new Set(
      articleRows
        .map((row) => normalizeArticle(String(row.nom_article || "")))
        .filter((value) => value.length > 0)
    ),
  ];

  if (normalizedTargets.length === 0) {
    return new Map<string, number>();
  }

  const idsByArticleKey = new Map<string, number[]>();
  for (const row of articleRows) {
    const articleKey = normalizeArticle(String(row.nom_article || ""));
    const articleId = Number(row.id ?? 0);

    if (!articleKey || articleId <= 0) continue;

    const currentIds = idsByArticleKey.get(articleKey) ?? [];
    currentIds.push(articleId);
    idsByArticleKey.set(articleKey, currentIds);
  }

  const unionIds = [...new Set([...idsByArticleKey.values()].flat().filter((value) => value > 0))];

  if (unionIds.length === 0) {
    return new Map<string, number>(normalizedTargets.map((key) => [key, 0]));
  }

  const allLots: StockPageRawRow[] = [];
  let from = 0;
  const pageSize = 1000;

  while (true) {
    const { data, error } = await supabaseServer
      .from("lots_stock")
      .select("id, article_id, numero_lot, date_jour, qte_entree, qte_sortie")
      .in("article_id", unionIds)
      .order("date_jour", { ascending: true })
      .order("id", { ascending: true })
      .range(from, from + pageSize - 1);

    if (error) {
      throw new Error(error.message);
    }

    const chunk = (data as StockPageRawRow[] | null) ?? [];
    allLots.push(...chunk);

    if (chunk.length < pageSize) {
      break;
    }

    from += pageSize;
  }

  const stockByArticle = new Map<string, number>();

  for (const articleKey of normalizedTargets) {
    const ids = new Set(idsByArticleKey.get(articleKey) ?? []);
    const relevantRows = allLots.filter((row) => ids.has(Number(row.article_id ?? 0)));
    stockByArticle.set(articleKey, computeCurrentStockLikeStockPage(relevantRows));
  }

  return stockByArticle;
}

export default async function ArticleManquantPage({ searchParams }: { searchParams: SearchParams }) {
  noStore();

  const params = await searchParams;
  const selectedFamille = String(params.famille || "").trim();
  const currentStockUser = await getCurrentStockUser();
  const canEditDormant = await canDeletePageUser(currentStockUser, "articleManquant");

  const { data: familleRowsData, error: familleRowsError } = await supabaseServer
    .from("famille_besoins")
    .select("famille_id, article_id, client, nombre_camion, mode_chargement, numero_proforma, quantite_prevue")
    .order("id", { ascending: true });

  if (familleRowsError) {
    throw new Error(familleRowsError.message);
  }

  const familleRows =
    ((familleRowsData as
      | {
          famille_id: number | null;
          article_id: number | null;
          client: string | null;
          nombre_camion: number | null;
          mode_chargement: string | null;
          numero_proforma: string | null;
          quantite_prevue: number | null;
        }[]
      | null) ?? []);

  const familleIds = [...new Set(familleRows.map((row) => Number(row.famille_id ?? 0)).filter((id) => id > 0))];
  const articleIds = [...new Set(familleRows.map((row) => Number(row.article_id ?? 0)).filter((id) => id > 0))];

  const [famillesResponse, articlesResponse] = await Promise.all([
    familleIds.length > 0
      ? supabaseServer.from("familles").select("id, nom_famille").in("id", familleIds)
      : Promise.resolve({ data: [], error: null }),
    articleIds.length > 0
      ? supabaseServer.from("articles").select("id, nom_article, gamme, article_normalise").in("id", articleIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (famillesResponse.error) {
    throw new Error(famillesResponse.error.message);
  }

  if (articlesResponse.error) {
    throw new Error(articlesResponse.error.message);
  }

  const familleMap = new Map(
    ((((famillesResponse.data as { id: number; nom_famille: string | null }[] | null) ?? []).map((row) => [
      row.id,
      String(row.nom_famille || "").trim(),
    ])))
  );

  const articleDataMap = new Map(
    ((((articlesResponse.data as
      | { id: number; nom_article: string | null; gamme: string | null; article_normalise: string | null }[]
      | null) ?? []).map((row) => [
      row.id,
      {
        nom_article: String(row.nom_article || "").trim(),
        gamme: String(row.gamme || "").trim(),
      },
    ])))
  );

  const planningRows = familleRows
    .map((row): PlanningRow | null => {
      const articleInfo = articleDataMap.get(Number(row.article_id ?? 0));
      if (!articleInfo?.nom_article) return null;

      return {
        famille: familleMap.get(Number(row.famille_id ?? 0)) || null,
        article: articleInfo.nom_article,
        quantite_prevue: Number(row.quantite_prevue ?? 0),
      };
    })
    .filter((row): row is PlanningRow => row !== null);

  const articlesData = ((articlesResponse.data as ArticleRow[] | null) ?? []);

  const availableFamilies = FAMILY_ORDER.filter((family) =>
    planningRows.some((row) => String(row.famille || "").trim() === family)
  );

  const targetFamilies = selectedFamille
    ? availableFamilies.filter((family) => family === selectedFamille)
    : availableFamilies;

  const negativeRows: {
    famille: string;
    article: string;
    totalCommande: number;
    stock: number;
    reste: number;
  }[] = [];

  for (const family of targetFamilies) {
    const familyPlanningRows = planningRows.filter(
      (row) => String(row.famille || "").trim() === family
    );

    const familyArticles = articlesData.filter((row) => familyMatches(String(row.gamme || ""), family));
    const stockByArticleName = await fetchArticleStocksFromStockPage(familyArticles);

    const totalsByArticle = new Map<string, { article: string; totalCommande: number }>();

    for (const row of familyPlanningRows) {
      const articleName = String(row.article || "").replace(/\u00a0/g, "").trim();
      if (!articleName) continue;

      const articleKey = normalizeArticle(articleName);
      const current = totalsByArticle.get(articleKey) ?? {
        article: articleName,
        totalCommande: 0,
      };

      current.totalCommande += Number(row.quantite_prevue ?? 0);
      totalsByArticle.set(articleKey, current);
    }

    for (const [articleKey, summary] of totalsByArticle) {
      const stock = Number(stockByArticleName.get(articleKey) ?? 0);
      const reste = stock - Number(summary.totalCommande ?? 0);

      if (reste < 0) {
        negativeRows.push({
          famille: family,
          article: summary.article,
          totalCommande: Number(summary.totalCommande ?? 0),
          stock,
          reste,
        });
      }
    }
  }

  negativeRows.sort((a, b) => {
    const familyDiff = FAMILY_ORDER.indexOf(a.famille) - FAMILY_ORDER.indexOf(b.famille);
    if (familyDiff !== 0) return familyDiff;
    return a.article.localeCompare(b.article, "fr", { sensitivity: "base" });
  });

  const famillesEnManque = [...new Set(negativeRows.map((row) => row.famille))].length;
  const articlesEnManque = negativeRows.length;
  const totalManque = negativeRows.reduce((sum, row) => sum + Math.abs(row.reste), 0);

  return (
    <main className="min-h-screen bg-[#f4f6f8] px-4 py-6 text-slate-900 lg:px-6">
      <div className="mx-auto w-full space-y-5">
        <section className="rounded-[1.75rem] border border-slate-200 bg-white px-6 py-5 shadow-[0_12px_30px_rgba(15,23,42,0.06)]">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.22em] text-[#b95b16]">
                ERP Rodis
              </p>
              <h1 className="mt-1 text-3xl font-black tracking-tight">Article manquant</h1>
              <p className="mt-2 text-sm text-slate-600">
                Tous les articles avec reste negatif dans tous les tableaux de commande.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <BackButton href="/" />
              <RefreshButton />
              <Link
                href="/tableau-commandes"
                className="rounded-full bg-slate-950 px-4 py-2 text-sm font-semibold text-white"
              >
                Tableau cmd
              </Link>
              {canEditDormant ? (
                <form action={deleteStandFamilleBesoinsAction}>
                  <DeleteIconButton label="Supprimer les Stand" />
                </form>
              ) : null}
            </div>
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-3">
          <div className="rounded-[1.5rem] border border-slate-200 bg-white px-5 py-4 shadow-[0_12px_30px_rgba(15,23,42,0.06)]">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Familles en manque</p>
            <p className="mt-2 text-3xl font-black text-slate-950">{formatQuantity(famillesEnManque)}</p>
          </div>
          <div className="rounded-[1.5rem] border border-slate-200 bg-white px-5 py-4 shadow-[0_12px_30px_rgba(15,23,42,0.06)]">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Articles en manque</p>
            <p className="mt-2 text-3xl font-black text-slate-950">{formatQuantity(articlesEnManque)}</p>
          </div>
          <div className="rounded-[1.5rem] border border-slate-200 bg-white px-5 py-4 shadow-[0_12px_30px_rgba(15,23,42,0.06)]">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Total manquant</p>
            <p className="mt-2 text-3xl font-black text-red-700">{formatQuantity(totalManque)}</p>
          </div>
        </section>

        <section className="rounded-[1.75rem] border border-slate-200 bg-white px-5 py-5 shadow-[0_12px_30px_rgba(15,23,42,0.06)]">
          <div className="flex flex-wrap gap-3">
            <Link
              href="/article-manquant"
              className={selectedFamille ? "rounded-xl bg-slate-100 px-4 py-2 text-sm font-black leading-none text-slate-700 shadow-sm transition hover:scale-[1.02] hover:opacity-90" : "rounded-xl bg-slate-950 px-4 py-2 text-sm font-black leading-none text-white shadow-sm transition hover:scale-[1.02] hover:opacity-90"}
            >
              Tous
            </Link>
            {availableFamilies.map((family) => {
              const buttonStyle = FAMILY_BUTTON_STYLES[family] || "bg-slate-200 text-slate-950";
              const active = family === selectedFamille;

              return (
                <Link
                  key={family}
                  href={`/article-manquant?famille=${encodeURIComponent(family)}`}
                  className={`rounded-xl px-4 py-2 text-sm font-black leading-none shadow-sm transition hover:scale-[1.02] hover:opacity-90 ${buttonStyle} ${active ? "ring-2 ring-slate-950/30" : ""}`}
                >
                  {family}
                </Link>
              );
            })}
          </div>
        </section>

        <section className="rounded-[1.75rem] border border-slate-200 bg-white px-5 py-5 shadow-[0_12px_30px_rgba(15,23,42,0.06)]">
          {negativeRows.length === 0 ? (
            <div className="rounded-[1.5rem] border border-emerald-200 bg-emerald-50 px-5 py-6 text-center text-sm font-semibold text-emerald-900">
              Aucun article manquant pour le filtre actuel.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full border-collapse text-sm">
                <thead>
                  <tr>
                    <th className="border border-slate-300 bg-[#14989d] px-3 py-3 text-left font-black text-slate-950">Famille</th>
                    <th className="border border-slate-300 bg-[#14989d] px-3 py-3 text-left font-black text-slate-950">Article</th>
                    <th className="border border-slate-300 bg-[#14989d] px-3 py-3 text-center font-black text-slate-950">Total commande</th>
                    <th className="border border-slate-300 bg-[#14989d] px-3 py-3 text-center font-black text-slate-950">Stock</th>
                    <th className="border border-slate-300 bg-[#14989d] px-3 py-3 text-center font-black text-slate-950">Reste</th>
                  </tr>
                </thead>
                <tbody>
                  {negativeRows.map((row) => {
                    const familyStyle = FAMILY_BUTTON_STYLES[row.famille] || "bg-slate-200 text-slate-950";

                    return (
                      <tr key={`${row.famille}-${row.article}`} className="bg-[#fffde7]">
                        <td className="border border-slate-300 px-3 py-2">
                          <span className={`inline-flex rounded-lg px-3 py-1 text-xs font-black ${familyStyle}`}>
                            {row.famille}
                          </span>
                        </td>
                        <td className="border border-slate-300 bg-[#fffde7] px-3 py-2 font-black italic text-slate-950">
                          {row.article}
                        </td>
                        <td className="border border-slate-300 px-3 py-2 text-center font-black text-slate-950">
                          {formatQuantity(row.totalCommande)}
                        </td>
                        <td className="border border-slate-300 px-3 py-2 text-center font-black text-slate-950">
                          {formatQuantity(row.stock)}
                        </td>
                        <td className="border border-slate-300 bg-[#fff59d] px-3 py-2 text-center font-black text-red-700">
                          {formatQuantity(row.reste)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

