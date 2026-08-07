import Link from "next/link";
import { supabaseServer } from "@/lib/supabase-server";
import { PersistPageFilters } from "@/app/_components/persist-page-filters";
import { BackButton } from "@/app/_components/back-button";
import { RefreshButton } from "@/app/_components/refresh-button";
import { DormantTable } from "../stock-dormant/dormant-table";
import { DormantFilterForm } from "../stock-dormant/filter-form";
import { matchesArticleSearch } from "@/lib/article-search";

// Assez grand pour afficher tout le dormant sur une seule page - meme
// convention que /stock-dormant.
const PAGE_SIZE = 5000;

type SearchParams = Promise<{
  page?: string;
  article?: string;
  gamme?: string;
  type?: string | string[];
  couleur?: string;
}>;

type DormantRow = {
  lot_stock_id: number;
  nom_article: string;
  type_article: string | null;
  gamme: string | null;
  marque: string | null;
  numero_lot: string;
  stock_restant: number;
  date_fabrication: string;
  age_jours: number;
  priorite: number;
  couleur: string | null;
};

type RawLotRow = {
  id: number;
  article_id: number | null;
  numero_lot: string | null;
  code_normalise: string | null;
  date_fabrication: string | null;
  qte_entree: number | null;
  qte_sortie: number | null;
  articles: {
    nom_article: string;
    type_article: string | null;
    marque: string | null;
    gamme: string | null;
  } | null;
};

type LotGroup = {
  lot_stock_id: number;
  article_id: number;
  numero_lot: string;
  date_fabrication: string | null;
  stock_restant: number;
  nom_article: string;
  type_article: string | null;
  marque: string | null;
  gamme: string | null;
};

function monthsBetween(fromDate: Date, toDate: Date) {
  return (
    (toDate.getFullYear() - fromDate.getFullYear()) * 12 +
    (toDate.getMonth() - fromDate.getMonth())
  );
}

// Memes seuils d'age que /stock-dormant : clarifiant 2/4/6, hydratant
// 4/6/9, tout le reste 6/9/12.
function getDormantThresholds(typeArticle: string | null): [number, number, number] {
  const type = (typeArticle || "").trim().toLowerCase();
  if (type === "clarifiant") return [2, 4, 6];
  if (type === "hydratant") return [4, 6, 9];
  return [6, 9, 12];
}

function getDormantColor(ageMois: number, typeArticle: string | null) {
  const [jaune, orange, rouge] = getDormantThresholds(typeArticle);
  if (ageMois >= rouge) return "ROUGE";
  if (ageMois >= orange) return "ORANGE";
  if (ageMois >= jaune) return "JAUNE";
  return null;
}

function priorityRank(couleur: string | null) {
  if (couleur === "ROUGE") return 3;
  if (couleur === "ORANGE") return 2;
  if (couleur === "JAUNE") return 1;
  return 0;
}

// "Sans commande" = le stock dormant de /stock-dormant, MOINS ce qui est
// deja reserve par une commande pas encore livree (stand, en cours,
// bl transforme...). La reservation vient de fifo_resultats.lot_stock_id,
// deja calculee par le vrai moteur FIFO - donc la regle "continair = prend
// le lot le plus recent" est deja respectee en amont, on n'a pas besoin de
// la reappliquer ici : on lit juste quel lot a ete reellement reserve. Une
// commande LIVREE est deja physiquement sortie du stock (sorties deja dans
// lots_stock), donc elle ne doit plus rien retirer ici.
async function fetchDormantSansCommandeRows(): Promise<{
  rows: DormantRow[];
  error: { message: string } | null;
}> {
  // PostgREST plafonne chaque requete a son max-rows interne (~1000) peu
  // importe le .range() demande - il faut paginer en boucle, sinon la
  // plupart des lots (et donc des articles dormants) sont silencieusement
  // absents du calcul.
  const rawRows: RawLotRow[] = [];
  let from = 0;
  const pageSize = 1000;

  while (true) {
    const { data, error } = await supabaseServer
      .from("lots_stock")
      .select(
        "id, article_id, numero_lot, code_normalise, date_fabrication, qte_entree, qte_sortie, articles!inner(nom_article, type_article, marque, gamme)"
      )
      .range(from, from + pageSize - 1);

    if (error) {
      return { rows: [], error };
    }

    const chunk = (data as unknown as RawLotRow[] | null) ?? [];
    rawRows.push(...chunk);

    if (chunk.length < pageSize) break;
    from += pageSize;
  }

  const groups = new Map<string, LotGroup>();

  for (const row of rawRows) {
    if (!row.article_id) continue;

    const lotKey = `${row.article_id}::${String(row.code_normalise || row.numero_lot || "").trim().toUpperCase()}`;

    const current = groups.get(lotKey) ?? {
      lot_stock_id: row.id,
      article_id: row.article_id,
      numero_lot: String(row.numero_lot || row.code_normalise || "").trim(),
      date_fabrication: row.date_fabrication,
      stock_restant: 0,
      nom_article: row.articles?.nom_article || "-",
      type_article: row.articles?.type_article || null,
      marque: row.articles?.marque || null,
      gamme: row.articles?.gamme || null,
    };

    current.stock_restant += Number(row.qte_entree ?? 0) - Number(row.qte_sortie ?? 0);

    // Plus ancienne date_fabrication gagne (meme convention que partout
    // ailleurs) - voir le meme correctif dans /stock-dormant.
    if (
      row.date_fabrication &&
      (!current.date_fabrication ||
        new Date(row.date_fabrication).getTime() < new Date(current.date_fabrication).getTime())
    ) {
      current.date_fabrication = row.date_fabrication;
    }

    groups.set(lotKey, current);
  }

  // On prend la demande brute de commande_lignes (quantite_demandee), pas
  // seulement fifo_resultats - meme si "Despatcher" n'a jamais ete clique
  // pour une commande, elle a deja besoin de cette quantite. La demande
  // "consomme" virtuellement les lots les plus anciens en premier (comme
  // le ferait un vrai FIFO), pour que le stock reellement libre soit ce qui
  // reste apres avoir servi toutes les commandes pas encore livrees.
  const demandRows: { article_id: number | null; quantite_demandee: number | null }[] = [];
  let demandFrom = 0;

  // Meme plafond PostgREST a ~1000 lignes - sans cette boucle, la demande
  // au-dela de la 1000e ligne etait ignoree, ce qui pouvait faire croire
  // qu'un article dormant est libre alors qu'il est encore commande.
  while (true) {
    const { data, error } = await supabaseServer
      .from("commande_lignes")
      .select("article_id, quantite_demandee, commandes!inner(statut)")
      .neq("commandes.statut", "LIVREE")
      .range(demandFrom, demandFrom + pageSize - 1);

    if (error) {
      return { rows: [], error };
    }

    const chunk =
      (data as { article_id: number | null; quantite_demandee: number | null }[] | null) ?? [];
    demandRows.push(...chunk);

    if (chunk.length < pageSize) break;
    demandFrom += pageSize;
  }

  const demandByArticle = new Map<number, number>();

  for (const row of demandRows) {
    if (!row.article_id) continue;

    demandByArticle.set(
      row.article_id,
      (demandByArticle.get(row.article_id) ?? 0) + Number(row.quantite_demandee ?? 0)
    );
  }

  const lotsByArticle = new Map<number, LotGroup[]>();

  for (const group of groups.values()) {
    const list = lotsByArticle.get(group.article_id) ?? [];
    list.push(group);
    lotsByArticle.set(group.article_id, list);
  }

  for (const [articleId, demand] of demandByArticle) {
    let remainingDemand = demand;
    if (remainingDemand <= 0) continue;

    const articleLots = (lotsByArticle.get(articleId) ?? [])
      .filter((lot) => lot.stock_restant > 0 && lot.date_fabrication)
      .sort(
        (a, b) => new Date(a.date_fabrication as string).getTime() - new Date(b.date_fabrication as string).getTime()
      );

    for (const lot of articleLots) {
      if (remainingDemand <= 0) break;

      const consumed = Math.min(lot.stock_restant, remainingDemand);
      lot.stock_restant -= consumed;
      remainingDemand -= consumed;
    }
  }

  const today = new Date();
  const rows: DormantRow[] = [];

  for (const group of groups.values()) {
    // Comme /stock : une fois la reservation deduite, si le solde n'est
    // plus positif, le lot ne compte plus du tout (pas de "0" affiche).
    if (group.stock_restant <= 0 || !group.date_fabrication) continue;

    const fabDate = new Date(group.date_fabrication);
    const ageMois = monthsBetween(fabDate, today);
    const couleur = getDormantColor(ageMois, group.type_article);

    if (!couleur) continue;

    const ageJours = Math.max(0, Math.round((today.getTime() - fabDate.getTime()) / 86400000));

    rows.push({
      lot_stock_id: group.lot_stock_id,
      nom_article: group.nom_article,
      type_article: group.type_article,
      gamme: group.gamme,
      marque: group.marque,
      numero_lot: group.numero_lot,
      stock_restant: group.stock_restant,
      date_fabrication: group.date_fabrication,
      age_jours: ageJours,
      priorite: priorityRank(couleur),
      couleur,
    });
  }

  rows.sort((a, b) => {
    if (b.priorite !== a.priorite) return b.priorite - a.priorite;
    return b.age_jours - a.age_jours;
  });

  return { rows, error: null };
}

function buildPageHref(
  page: number,
  article: string,
  gamme: string,
  types: string | string[],
  couleur: string
) {
  const params = new URLSearchParams();
  params.set("page", String(page));
  if (article) params.set("article", article);
  if (gamme) params.set("gamme", gamme);
  for (const value of Array.isArray(types) ? types : types ? [types] : []) {
    if (value) params.append("type", value);
  }
  if (couleur) params.set("couleur", couleur);
  return `/stock-dormant-sans-commande?${params.toString()}`;
}

function colorBadgeClasses(couleur: string) {
  switch (couleur) {
    case "ROUGE":
      return "bg-red-100 text-red-900";
    case "ORANGE":
      return "bg-orange-100 text-orange-900";
    case "JAUNE":
      return "bg-amber-100 text-amber-900";
    default:
      return "bg-slate-100 text-slate-700";
  }
}

export default async function StockDormantSansCommandePage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const currentPage = Math.max(1, Number(params.page || "1") || 1);
  const article = (params.article || "").trim();
  const gamme = (params.gamme || "").trim();
  const selectedTypes = (Array.isArray(params.type) ? params.type : params.type ? [params.type] : [])
    .map((value) => value.trim())
    .filter(Boolean);
  const couleur = (params.couleur || "").trim();

  const { rows: allDormantRows, error: effectiveError } = await fetchDormantSansCommandeRows();
  const allTypeOptions = [...new Set(allDormantRows.map((ligne) => ligne.type_article).filter(Boolean))].sort(
    (a, b) => String(a).localeCompare(String(b))
  ) as string[];
  const articleOptions = [...new Set(allDormantRows.map((ligne) => ligne.nom_article).filter(Boolean))].sort(
    (a, b) => a.localeCompare(b, "fr")
  );
  const gammeOptions = [...new Set(allDormantRows.map((ligne) => ligne.gamme).filter(Boolean))].sort(
    (a, b) => String(a).localeCompare(String(b), "fr")
  ) as string[];

  let filteredRows = allDormantRows;

  if (article) {
    filteredRows = filteredRows.filter((ligne) => matchesArticleSearch(ligne.nom_article, article));
  }

  if (gamme) {
    const needle = gamme.toLowerCase();
    filteredRows = filteredRows.filter((ligne) => (ligne.gamme || "").toLowerCase().includes(needle));
  }

  if (selectedTypes.length > 0) {
    const selectedLower = selectedTypes.map((value) => value.toLowerCase());
    filteredRows = filteredRows.filter((ligne) =>
      selectedLower.includes((ligne.type_article || "").toLowerCase())
    );
  }

  if (couleur) {
    const needle = couleur.toUpperCase();
    filteredRows = filteredRows.filter((ligne) => (ligne.couleur || "").includes(needle));
  }

  const totalLignes = filteredRows.length;
  const totalPages = Math.max(1, Math.ceil(totalLignes / PAGE_SIZE));
  const from = (currentPage - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE;
  const lignes = filteredRows.slice(from, to);
  const typeSuggestions = [...new Set(lignes.map((ligne) => ligne.type_article).filter(Boolean))].slice(
    0,
    8
  );

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#fff8ee_0%,#fffdf8_48%,#ffffff_100%)] px-6 py-8 text-slate-900 lg:px-10">
      <PersistPageFilters />
      <div className="mx-auto w-full space-y-6">
        <div className="flex flex-col gap-4 rounded-[2rem] border border-black/5 bg-white/85 p-6 shadow-[0_18px_50px_rgba(15,23,42,0.08)] backdrop-blur sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-amber-700">
              ERP Rodis
            </p>
            <h1 className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">
              Stock dormant sans commande
            </h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600 sm:text-base">
              Meme stock dormant que la page precedente, mais on retire la quantite
              demandee par toute commande pas encore livree (stand, en cours,
              bl transforme) - meme si elle n&apos;a jamais ete despatchee. Ne reste
              que ce qui n&apos;a vraiment aucune commande derriere.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <BackButton href="/" label="Retour accueil" />
            <RefreshButton />
            <Link
              href="/stock"
              className="rounded-full bg-slate-950 px-5 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
            >
              Voir Stock
            </Link>
            <Link
              href="/stock-dormant"
              className="rounded-full bg-amber-500 px-5 py-2 text-sm font-semibold text-white transition hover:bg-amber-400"
            >
              Dormant avec cmd
            </Link>
          </div>
        </div>

        <section className="overflow-hidden rounded-[2rem] border border-black/5 bg-white shadow-[0_18px_50px_rgba(15,23,42,0.08)]">
          <div className="flex flex-col gap-3 border-b border-slate-100 px-6 py-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-xl font-bold">Lots dormants sans commande</h2>
              <p className="mt-1 text-sm text-slate-500">
                Total : {totalLignes} lot(s). Page {currentPage} sur {totalPages}.
              </p>
            </div>

            <div className="flex flex-wrap gap-2 text-sm">
              <span className="rounded-full bg-amber-100 px-4 py-2 font-semibold text-amber-900">
                Jaune / Orange / Rouge
              </span>
            </div>
          </div>

          <DormantFilterForm
            defaultArticle={article}
            defaultGamme={gamme}
            defaultCouleur={couleur}
            articleOptions={articleOptions}
            gammeOptions={gammeOptions}
            allTypeOptions={allTypeOptions}
            selectedTypes={selectedTypes}
          />

          <div className="grid gap-4 border-b border-slate-100 px-6 py-5 md:grid-cols-2">
            <div>
              <p className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                Conditions dormant (age depuis la date de fabrication)
              </p>
              <div className="overflow-hidden rounded-[1.25rem] border border-slate-300">
                <table className="border-collapse text-center text-sm table-fixed">
                  <colgroup>
                    <col style={{ width: "300px" }} />
                    <col style={{ width: "120px" }} />
                    <col style={{ width: "120px" }} />
                    <col style={{ width: "120px" }} />
                  </colgroup>
                  <thead>
                    <tr>
                      <th className="border border-slate-300 bg-white px-4 py-3 font-bold text-slate-900">
                        TYPE
                      </th>
                      <th className="border border-slate-300 bg-white px-4 py-3 font-bold text-slate-900">
                        JAUNE
                      </th>
                      <th className="border border-slate-300 bg-white px-4 py-3 font-bold text-slate-900">
                        ORANGE
                      </th>
                      <th className="border border-slate-300 bg-white px-4 py-3 font-bold text-slate-900">
                        ROUGE
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td className="border border-slate-300 px-4 py-3">clarifiant</td>
                      <td className="border border-slate-300 bg-amber-100 px-4 py-3 font-semibold text-slate-900">
                        + 2 mois
                      </td>
                      <td className="border border-slate-300 bg-orange-200 px-4 py-3 font-semibold text-slate-900">
                        + 4 mois
                      </td>
                      <td className="border border-slate-300 bg-red-200 px-4 py-3 font-semibold text-slate-900">
                        + 6 mois
                      </td>
                    </tr>
                    <tr>
                      <td className="border border-slate-300 px-4 py-3">hydratant</td>
                      <td className="border border-slate-300 bg-amber-100 px-4 py-3 font-semibold text-slate-900">
                        + 4 mois
                      </td>
                      <td className="border border-slate-300 bg-orange-200 px-4 py-3 font-semibold text-slate-900">
                        + 6 mois
                      </td>
                      <td className="border border-slate-300 bg-red-200 px-4 py-3 font-semibold text-slate-900">
                        + 9 mois
                      </td>
                    </tr>
                    <tr>
                      <td className="whitespace-normal break-words border border-slate-300 px-4 py-3 text-xs leading-snug">
                        pommade / huile / serum / gel douche / savon / menthole / parfume / talc /
                        gel / lave vitre / antiseptique
                      </td>
                      <td className="border border-slate-300 bg-amber-100 px-4 py-3 font-semibold text-slate-900">
                        + 6 mois
                      </td>
                      <td className="border border-slate-300 bg-orange-200 px-4 py-3 font-semibold text-slate-900">
                        + 9 mois
                      </td>
                      <td className="border border-slate-300 bg-red-200 px-4 py-3 font-semibold text-slate-900">
                        + 12 mois
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            <div className="rounded-[1.75rem] border border-slate-100 bg-slate-50 p-5">
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">
                Filtres rapides
              </p>

              <div className="mt-4 space-y-4 text-sm">
                <div>
                  <p className="font-semibold text-slate-900">Types visibles</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {typeSuggestions.length === 0 ? (
                      <span className="rounded-full bg-white px-3 py-1 text-slate-500">Aucun</span>
                    ) : (
                      typeSuggestions.map((item) => (
                        <Link
                          key={item}
                          href={buildPageHref(1, article, gamme, String(item || ""), couleur)}
                          className="rounded-full bg-white px-3 py-1 font-semibold text-slate-700 transition hover:bg-slate-200"
                        >
                          {item}
                        </Link>
                      ))
                    )}
                  </div>
                </div>

                <div>
                  <p className="font-semibold text-slate-900">Couleurs</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {["ROUGE", "ORANGE", "JAUNE"].map((item) => (
                      <Link
                        key={item}
                        href={buildPageHref(1, article, gamme, selectedTypes, item)}
                        className={`rounded-full px-3 py-1 font-semibold transition hover:opacity-90 ${colorBadgeClasses(
                          item
                        )}`}
                      >
                        {item}
                      </Link>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {effectiveError ? (
            <div className="px-6 py-8">
              <p className="rounded-2xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
                {effectiveError.message}
              </p>
            </div>
          ) : lignes.length === 0 ? (
            <div className="px-6 py-8 text-sm text-slate-500">
              Aucun stock dormant sans commande detecte pour le moment.
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <DormantTable rows={lignes} />
              </div>

              <div className="flex items-center justify-between border-t border-slate-100 px-6 py-4 text-sm">
                <p className="text-slate-500">
                  Lignes {from + 1} a {Math.min(from + PAGE_SIZE, totalLignes)} sur{" "}
                  {totalLignes}
                </p>

                <div className="flex gap-3">
                  <Link
                    href={buildPageHref(1, article, gamme, selectedTypes, couleur)}
                    className={`rounded-full px-4 py-2 font-semibold ${
                      currentPage === 1
                        ? "pointer-events-none bg-slate-100 text-slate-400"
                        : "bg-white text-slate-900 ring-1 ring-slate-200 hover:bg-slate-50"
                    }`}
                  >
                    Premiere
                  </Link>
                  <Link
                    href={buildPageHref(Math.max(1, currentPage - 1), article, gamme, selectedTypes, couleur)}
                    className={`rounded-full px-4 py-2 font-semibold ${
                      currentPage === 1
                        ? "pointer-events-none bg-slate-100 text-slate-400"
                        : "bg-slate-900 text-white hover:bg-slate-800"
                    }`}
                  >
                    Precedent
                  </Link>
                  <Link
                    href={buildPageHref(
                      Math.min(totalPages, currentPage + 1),
                      article,
                      gamme,
                      selectedTypes,
                      couleur
                    )}
                    className={`rounded-full px-4 py-2 font-semibold ${
                      currentPage >= totalPages
                        ? "pointer-events-none bg-slate-100 text-slate-400"
                        : "bg-slate-900 text-white hover:bg-slate-800"
                    }`}
                  >
                    Suivant
                  </Link>
                  <Link
                    href={buildPageHref(totalPages, article, gamme, selectedTypes, couleur)}
                    className={`rounded-full px-4 py-2 font-semibold ${
                      currentPage >= totalPages
                        ? "pointer-events-none bg-slate-100 text-slate-400"
                        : "bg-white text-slate-900 ring-1 ring-slate-200 hover:bg-slate-50"
                    }`}
                  >
                    Derniere
                  </Link>
                </div>
              </div>
            </>
          )}
        </section>
      </div>
    </main>
  );
}
