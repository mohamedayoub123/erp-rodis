import { unstable_noStore as noStore } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import { canVoirPrixUser, canWritePageUser, getCurrentStockUser } from "@/lib/stock-auth";
import { fetchCoutsParCartonProduitsFinis } from "@/lib/prix-revient";
import { BackButton } from "@/app/_components/back-button";
import { RefreshButton } from "@/app/_components/refresh-button";
import { PrixVenteTable, type ArticlePrixRow } from "./prix-vente-table";

type ArticleRow = { id: number; nom_article: string; code_auto: string | null; code_manu: string | null; prix_vente: number | null };

async function fetchAllArticlesFini(): Promise<ArticleRow[]> {
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

export default async function PrixVentePage() {
  noStore();

  const currentUser = await getCurrentStockUser();
  const canWrite = await canWritePageUser(currentUser, "comptabilite");
  const canVoirPrix = await canVoirPrixUser(currentUser);

  const [articles, { data: clientsData }] = await Promise.all([
    fetchAllArticlesFini(),
    supabaseServer.from("clients").select("id, nom_client").order("nom_client", { ascending: true }),
  ]);

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
          <PrixVenteTable rows={rows} clients={clients} canWrite={canWrite} />
        )}
      </div>
    </main>
  );
}
