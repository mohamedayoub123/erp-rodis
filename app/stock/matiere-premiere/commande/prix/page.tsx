import Link from "next/link";
import { unstable_noStore as noStore } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import { canWritePageUser, getCurrentStockUser } from "@/lib/stock-auth";
import { BackButton } from "@/app/_components/back-button";
import { RefreshButton } from "@/app/_components/refresh-button";
import { SubmitButton } from "@/app/_components/submit-button";
import { SearchableFilterInput } from "@/app/_components/searchable-filter-input";
import { DeviseTauxFormField } from "@/app/_components/devise-taux-input";
import { formatDate } from "@/lib/format-date";
import { matchesArticleSearch } from "@/lib/article-search";
import { updateLotPrixAction } from "../actions";

type LotRow = {
  id: number;
  numero_lot: string | null;
  article_id: number | null;
  fournisseur: string | null;
  date_reception: string | null;
  qte_entree: number | null;
  unite: string | null;
  prix_unitaire: number | null;
  devise: string | null;
  taux_change: number | null;
};

type ArticleMpRow = { id: number; nom_article: string };

const LIMITE_TOUS = 500;

// lots_stock_matiere_premiere est un journal qui ne fait que grossir (voir
// meme remarque sur stock-actuel/page.tsx) - jamais le rapatrier en entier
// cote JS. Le filtre "sans prix" se fait cote base (rapide, ensemble
// borne) ; "tous" est plafonne aux plus recents pour rester rapide.
//
// "ancien_lot" (~40 000 lignes, qte_entree = 0) est un marqueur de donnees
// historiques importees en masse avant le suivi par lot individuel - pas de
// vrai lot identifiable, un prix n'aurait aucun sens dessus. Exclu partout
// ici (confirme en base : 41 986 lignes "sans prix" au total dont 40 379
// "ancien_lot" et 37 371 a qte_entree=0 - seulement ~386 lignes sont de
// vrais lots recents a completer).
async function fetchLots(afficherTous: boolean) {
  let query = supabaseServer
    .from("lots_stock_matiere_premiere")
    .select("id, numero_lot, article_id, fournisseur, date_reception, qte_entree, unite, prix_unitaire, devise, taux_change")
    .neq("numero_lot", "ancien_lot")
    .gt("qte_entree", 0)
    .order("date_reception", { ascending: false });

  query = afficherTous ? query.limit(LIMITE_TOUS) : query.is("prix_unitaire", null);

  const { data, error } = await query;
  return { rows: (data ?? []) as LotRow[], error };
}

async function countLotsSansPrix() {
  const { count } = await supabaseServer
    .from("lots_stock_matiere_premiere")
    .select("id", { count: "exact", head: true })
    .is("prix_unitaire", null)
    .neq("numero_lot", "ancien_lot")
    .gt("qte_entree", 0);
  return count ?? 0;
}

async function fetchAllArticlesMp() {
  const rows: ArticleMpRow[] = [];
  let from = 0;
  const pageSize = 1000;

  while (true) {
    const { data, error } = await supabaseServer
      .from("articles_matiere_premiere")
      .select("id, nom_article")
      .range(from, from + pageSize - 1);

    if (error) break;

    const chunk = (data ?? []) as ArticleMpRow[];
    rows.push(...chunk);

    if (chunk.length < pageSize) break;
    from += pageSize;
  }

  return rows;
}

type SearchParams = Promise<{ tous?: string; lot?: string; article?: string }>;

// Garde tout filtre actif quand on bascule sans prix / tous les lots.
function toggleHref(tous: boolean, lotFilter: string, articleFilter: string) {
  const qs = new URLSearchParams();
  if (tous) qs.set("tous", "1");
  if (lotFilter) qs.set("lot", lotFilter);
  if (articleFilter) qs.set("article", articleFilter);
  const query = qs.toString();
  return `/stock/matiere-premiere/commande/prix${query ? `?${query}` : ""}`;
}

// Meme principe que "Prix des BC MP" (/stock/matiere-premiere/bc/prix) mais
// pour les lots deja receptionnes - un lot cree avant l'ajout du prix, ou
// receptionne sans, n'avait sinon aucun endroit centralise pour repasser en
// revue et remplir son prix en dehors du dossier Import qui l'a cree.
export default async function CommandeMpPrixPage({ searchParams }: { searchParams: SearchParams }) {
  noStore();
  const params = await searchParams;
  const afficherTous = params.tous === "1";
  const lotFilter = (params.lot || "").trim().toLowerCase();
  const articleFilter = (params.article || "").trim();

  const currentUser = await getCurrentStockUser();
  const canEdit = await canWritePageUser(currentUser, "commandeMp");

  const [{ rows: allRows, error }, articlesMp, nbSansPrix] = await Promise.all([
    fetchLots(afficherTous),
    fetchAllArticlesMp(),
    countLotsSansPrix(),
  ]);
  const mpById = new Map(articlesMp.map((article) => [article.id, article]));

  const rows = allRows.filter((row) => {
    if (lotFilter && !(row.numero_lot || "").toLowerCase().includes(lotFilter)) return false;
    if (articleFilter) {
      const nomArticle = row.article_id ? mpById.get(row.article_id)?.nom_article ?? "" : "";
      if (!matchesArticleSearch(nomArticle, articleFilter)) return false;
    }
    return true;
  });

  const articleOptions = articlesMp
    .map((article) => ({ id: article.id, label: article.nom_article }))
    .sort((a, b) => a.label.localeCompare(b.label, "fr", { sensitivity: "base" }));

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#edf8ff_0%,#f8fcff_48%,#ffffff_100%)] px-6 py-8 text-slate-900 lg:px-10">
      <div className="mx-auto w-full space-y-6">
        <div className="flex flex-col gap-4 rounded-[2rem] border border-black/5 bg-white/85 p-6 shadow-[0_18px_50px_rgba(15,23,42,0.08)] backdrop-blur sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-sky-700">ERP Rodis</p>
            <h1 className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">Prix des lots MP</h1>
            <p className="mt-2 text-sm leading-6 text-slate-600 sm:text-base">
              Retrouve et remplit les lots (numeros de lot) receptionnes sans prix - {nbSansPrix} lot
              {nbSansPrix > 1 ? "s" : ""} sans prix au total.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <BackButton href="/stock/matiere-premiere/commande" label="Retour Import MP" />
            <RefreshButton />
          </div>
        </div>

        <section className="rounded-[2rem] border border-black/5 bg-white p-5 shadow-[0_18px_50px_rgba(15,23,42,0.08)]">
          <div className="flex items-center gap-3 text-sm">
            <Link
              href={toggleHref(false, lotFilter, articleFilter)}
              className={`rounded-full px-4 py-2 font-semibold transition ${
                afficherTous ? "border border-slate-200 text-slate-700" : "bg-slate-950 text-white"
              }`}
            >
              Sans prix uniquement
            </Link>
            <Link
              href={toggleHref(true, lotFilter, articleFilter)}
              className={`rounded-full px-4 py-2 font-semibold transition ${
                afficherTous ? "bg-slate-950 text-white" : "border border-slate-200 text-slate-700"
              }`}
            >
              Tous les lots
            </Link>
          </div>
          {afficherTous ? (
            <p className="mt-3 text-xs text-slate-400">
              Limite aux {LIMITE_TOUS} lots les plus recents (table trop volumineuse pour tout afficher).
            </p>
          ) : null}

          <form className="mt-4 grid gap-3 sm:grid-cols-[1fr_1fr_auto_auto]">
            {afficherTous ? <input type="hidden" name="tous" value="1" /> : null}
            <input
              type="text"
              name="lot"
              defaultValue={params.lot || ""}
              placeholder="Numero de lot"
              className="rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none"
            />
            <SearchableFilterInput
              name="article"
              defaultValue={params.article || ""}
              options={articleOptions}
              placeholder="Article"
            />
            <button type="submit" className="rounded-2xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white">
              Filtrer
            </button>
            {lotFilter || articleFilter ? (
              <Link
                href={toggleHref(afficherTous, "", "")}
                className="rounded-2xl border border-slate-200 px-5 py-3 text-center text-sm font-semibold text-slate-700"
              >
                Effacer
              </Link>
            ) : null}
          </form>
        </section>

        <section className="overflow-hidden rounded-[2rem] border border-black/5 bg-white shadow-[0_18px_50px_rgba(15,23,42,0.08)]">
          {error ? (
            <div className="px-6 py-8">
              <p className="rounded-2xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">{error.message}</p>
            </div>
          ) : rows.length === 0 ? (
            <div className="px-6 py-8 text-sm text-slate-500">
              {lotFilter || articleFilter
                ? "Aucun resultat pour ce filtre."
                : afficherTous
                  ? "Aucun lot pour le moment."
                  : "Tous les lots ont deja un prix."}
            </div>
          ) : (
            <div className="max-h-[75vh] overflow-auto">
              <table className="min-w-full border-separate border-spacing-0 text-left text-sm">
                <thead className="bg-slate-50 text-slate-950">
                  <tr>
                    <th className="sticky top-0 z-10 bg-slate-50 px-6 py-4 font-semibold">Numero de lot</th>
                    <th className="sticky top-0 z-10 bg-slate-50 px-6 py-4 font-semibold">Article</th>
                    <th className="sticky top-0 z-10 bg-slate-50 px-6 py-4 font-semibold">Fournisseur</th>
                    <th className="sticky top-0 z-10 bg-slate-50 px-6 py-4 font-semibold">Date reception</th>
                    <th className="sticky top-0 z-10 bg-slate-50 px-6 py-4 font-semibold">Qte entree</th>
                    <th className="sticky top-0 z-10 bg-slate-50 px-6 py-4 font-semibold">Prix unitaire</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => {
                    const articleMp = row.article_id ? mpById.get(row.article_id) : null;
                    return (
                      <tr key={row.id} className="border-t border-slate-100 align-top">
                        <td className="px-6 py-4 font-semibold text-slate-900">{row.numero_lot || "-"}</td>
                        <td className="px-6 py-4 font-medium text-slate-900">{articleMp?.nom_article || "-"}</td>
                        <td className="px-6 py-4 text-slate-600">{row.fournisseur || "-"}</td>
                        <td className="px-6 py-4 text-slate-600">{formatDate(row.date_reception)}</td>
                        <td className="px-6 py-4 text-slate-900">
                          {row.qte_entree ?? "-"} {row.unite || ""}
                        </td>
                        <td className="px-6 py-4">
                          {canEdit ? (
                            <form action={updateLotPrixAction} className="flex flex-wrap items-center gap-2">
                              <input type="hidden" name="lot_id" value={row.id} />
                              <input
                                type="number"
                                step="0.01"
                                min="0"
                                name="prix_unitaire"
                                defaultValue={row.prix_unitaire ?? ""}
                                placeholder="Prix unitaire"
                                className="w-32 rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none"
                              />
                              <DeviseTauxFormField deviseDefaultValue={row.devise} tauxDefaultValue={row.taux_change} />
                              <SubmitButton
                                pendingLabel="..."
                                className="rounded-full bg-slate-900 px-3 py-2 text-xs font-semibold text-white transition hover:bg-slate-800"
                              >
                                Enregistrer
                              </SubmitButton>
                            </form>
                          ) : (
                            <span className="text-slate-600">
                              {row.prix_unitaire !== null
                                ? `${row.prix_unitaire.toLocaleString("fr-FR")}${
                                    row.devise && row.devise !== "FCFA" ? ` ${row.devise}` : ""
                                  }`
                                : "-"}
                            </span>
                          )}
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
