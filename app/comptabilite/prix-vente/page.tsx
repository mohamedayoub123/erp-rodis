import { unstable_noStore as noStore } from "next/cache";
import Link from "next/link";
import { supabaseServer } from "@/lib/supabase-server";
import { canVoirPrixUser, canWritePageUser, getCurrentStockUser } from "@/lib/stock-auth";
import { fetchCoutsParCartonProduitsFinis } from "@/lib/prix-revient";
import { matchesArticleSearch } from "@/lib/article-search";
import { BackButton } from "@/app/_components/back-button";
import { RefreshButton } from "@/app/_components/refresh-button";
import { PrixVenteTable, type ArticlePrixRow } from "./prix-vente-table";

type ArticleRow = { id: number; nom_article: string; code_auto: string | null; code_manu: string | null; prix_vente: number | null };

type SearchParams = Promise<{ q?: string; page?: string }>;

const PAGE_SIZE = 100;

// Nom/code de TOUS les articles finis - requete legere (juste 5 colonnes,
// aucun calcul de cout), servant a chercher/paginer AVANT de decider quels
// articles chiffrer reellement. Le cout de revient (fetchCoutsParCartonProduitsFinis)
// est ce qui rendait cette page tres lente (~1min+) : il etait calcule pour
// TOUS les articles finis a chaque chargement, meme ceux jamais affiches
// (recette + FEFO sur les lots MP, par article) - desormais uniquement pour
// la page/le resultat de recherche reellement visible.
async function fetchAllArticlesFiniLeger(): Promise<ArticleRow[]> {
  const rows: ArticleRow[] = [];
  let from = 0;
  const pageSize = 1000;

  while (true) {
    const { data, error } = await supabaseServer
      .from("articles")
      .select("id, nom_article, code_auto, code_manu, prix_vente")
      .eq("nature", "fini")
      .order("nom_article", { ascending: true })
      .range(from, from + pageSize - 1);

    if (error) break;
    const chunk = (data as ArticleRow[] | null) ?? [];
    rows.push(...chunk);
    if (chunk.length < pageSize) break;
    from += pageSize;
  }

  return rows;
}

export default async function PrixVentePage({ searchParams }: { searchParams: SearchParams }) {
  noStore();

  const params = await searchParams;
  const q = (params.q || "").trim();
  const pageNum = Math.max(1, Number(params.page || "1") || 1);

  const currentUser = await getCurrentStockUser();
  const canWrite = await canWritePageUser(currentUser, "comptabilite");
  const canVoirPrix = await canVoirPrixUser(currentUser);

  const [allArticles, { data: clientsData }] = await Promise.all([
    fetchAllArticlesFiniLeger(),
    supabaseServer.from("clients").select("id, nom_client").order("nom_client", { ascending: true }),
  ]);

  const articlesMatches = q
    ? allArticles.filter(
        (a) => matchesArticleSearch(a.nom_article, q) || (a.code_auto || a.code_manu || "").toLowerCase().includes(q.toLowerCase())
      )
    : allArticles;

  const totalPages = Math.max(1, Math.ceil(articlesMatches.length / PAGE_SIZE));
  const pageSafe = Math.min(pageNum, totalPages);
  const articles = articlesMatches.slice((pageSafe - 1) * PAGE_SIZE, pageSafe * PAGE_SIZE);

  const articleIds = articles.map((a) => a.id);
  const [couts, { data: speciauxData }] = await Promise.all([
    fetchCoutsParCartonProduitsFinis(articleIds),
    articleIds.length > 0
      ? supabaseServer.from("prix_vente_speciaux").select("id, article_id, client_id, prix").in("article_id", articleIds)
      : Promise.resolve({ data: [] as { id: number; article_id: number; client_id: number; prix: number }[] }),
  ]);

  const clients = ((clientsData as { id: number; nom_client: string }[] | null) ?? []).map((c) => ({
    id: c.id,
    label: c.nom_client,
  }));
  const clientById = new Map(clients.map((c) => [c.id, c.label]));

  const speciaux = (speciauxData as { id: number; article_id: number; client_id: number; prix: number }[] | null) ?? [];
  const speciauxParArticle = new Map<number, { id: number; clientId: number; clientNom: string; prix: number }[]>();
  for (const s of speciaux) {
    const list = speciauxParArticle.get(s.article_id) ?? [];
    list.push({ id: s.id, clientId: s.client_id, clientNom: clientById.get(s.client_id) ?? `#${s.client_id}`, prix: s.prix });
    speciauxParArticle.set(s.article_id, list);
  }

  const rows: ArticlePrixRow[] = articles.map((a) => ({
    articleId: a.id,
    nomArticle: a.nom_article,
    code: a.code_auto || a.code_manu || "-",
    coutParCarton: couts.get(a.id)?.coutParCarton ?? null,
    prixVente: a.prix_vente,
    speciaux: speciauxParArticle.get(a.id) ?? [],
  }));

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#f4efe5_0%,#fbf8f2_45%,#ffffff_100%)] px-4 py-6 text-slate-900 lg:px-8">
      <div className="mx-auto w-full space-y-6">
        <section className="rounded-[1.75rem] border border-black/5 bg-white p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.16em] text-amber-700">
                Comptabilite
              </p>
              <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-900">Prix de vente</h1>
              <p className="mt-2 text-sm text-slate-600">
                Prix de revient (calcule) et prix de vente (a saisir) de chaque article produit fini -
                ajoute un prix special si un client precis paie un prix different du prix standard.
              </p>
            </div>

            <div className="flex items-center gap-3">
              <BackButton href="/comptabilite" label="Retour" />
              <RefreshButton />
            </div>
          </div>
        </section>

        {!canVoirPrix ? (
          <section className="rounded-[1.75rem] border border-black/5 bg-white p-8 text-center text-sm text-slate-500 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
            La visibilite des prix est reservee - demande l&apos;acces a un administrateur si besoin.
          </section>
        ) : (
          <>
            <section className="rounded-[1.75rem] border border-black/5 bg-white p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
              <form className="grid gap-3 sm:grid-cols-[1fr_auto_auto]">
                <input
                  type="text"
                  name="q"
                  defaultValue={q}
                  placeholder="Ecrire un article ou un code..."
                  className="rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none"
                />
                <button type="submit" className="rounded-2xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white">
                  Chercher
                </button>
                {q ? (
                  <Link
                    href="/comptabilite/prix-vente"
                    className="rounded-2xl border border-slate-200 px-5 py-3 text-center text-sm font-semibold text-slate-700"
                  >
                    Effacer
                  </Link>
                ) : null}
              </form>
              <p className="mt-3 text-xs text-slate-500">
                {articlesMatches.length.toLocaleString("fr-FR")} article(s){q ? " trouve(s)" : " au total"} - page{" "}
                {pageSafe} sur {totalPages}.
              </p>
            </section>

            <PrixVenteTable rows={rows} clients={clients} canWrite={canWrite} />

            {totalPages > 1 ? (
              <section className="flex items-center justify-between rounded-[1.75rem] border border-black/5 bg-white p-4 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
                <Link
                  href={`/comptabilite/prix-vente?${new URLSearchParams({ ...(q ? { q } : {}), page: String(Math.max(1, pageSafe - 1)) })}`}
                  className={`rounded-2xl border border-slate-200 px-5 py-2 text-sm font-semibold ${
                    pageSafe <= 1 ? "pointer-events-none text-slate-300" : "text-slate-700"
                  }`}
                >
                  Precedent
                </Link>
                <span className="text-sm text-slate-500">
                  Page {pageSafe} / {totalPages}
                </span>
                <Link
                  href={`/comptabilite/prix-vente?${new URLSearchParams({ ...(q ? { q } : {}), page: String(Math.min(totalPages, pageSafe + 1)) })}`}
                  className={`rounded-2xl border border-slate-200 px-5 py-2 text-sm font-semibold ${
                    pageSafe >= totalPages ? "pointer-events-none text-slate-300" : "text-slate-700"
                  }`}
                >
                  Suivant
                </Link>
              </section>
            ) : null}
          </>
        )}
      </div>
    </main>
  );
}
