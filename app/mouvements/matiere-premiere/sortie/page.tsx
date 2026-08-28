import { supabaseServer } from "@/lib/supabase-server";
import { canWritePageUser, getCurrentStockUser } from "@/lib/stock-auth";
import { SortieMpClient } from "./sortie-client";
import { BackButton } from "@/app/_components/back-button";
import { RefreshButton } from "@/app/_components/refresh-button";

async function fetchAllArticlesForSortie() {
  const rows: { id: number; nom_article: string; unite: string | null }[] = [];
  let from = 0;
  const pageSize = 1000;

  // PostgREST plafonne chaque requete a ~1000 lignes quel que soit le
  // .limit() demande - sans cette boucle, les articles au-dela du 1000e
  // (tries par nom) etaient invisibles dans le formulaire.
  while (true) {
    const { data, error } = await supabaseServer
      .from("articles_matiere_premiere")
      .select("id, nom_article, unite")
      .order("nom_article", { ascending: true })
      .range(from, from + pageSize - 1);

    if (error) break;

    const chunk = (data as { id: number; nom_article: string; unite: string | null }[] | null) ?? [];
    rows.push(...chunk);

    if (chunk.length < pageSize) break;
    from += pageSize;
  }

  return rows;
}

// Solde par article+lot (somme qte_entree - qte_sortie), pour que la Sortie
// normale propose seulement les lots qui existent reellement en stock, au
// lieu d'une saisie libre qui peut viser un lot inexistant. Calcule en base
// (RPC stock_mp_lot_balances) plutot qu'en rapatriant toute la table
// lots_stock_matiere_premiere (dizaines de milliers de lignes) pour agreger
// cote Node - cette derniere approche rendait la page tres lente (~12s).
//
// Pagine (.range()) - un simple appel RPC sans pagination plafonne
// silencieusement a 1000 lignes (limite par defaut Supabase/PostgREST),
// et il y a largement plus de 1000 combinaisons article+lot distinctes -
// sans ordre garanti sur la fonction SQL, un article+lot pouvait tomber
// hors des 1000 premieres lignes et disparaitre de la liste : la Sortie le
// refusait alors comme "aucun lot en stock" alors qu'il existe bel et bien
// (bug reel confirme : ETUIS SAVON ELIXIR LIGHT 200 GR / "ancien lot",
// 629171 en stock, refuse par Sortie).
async function fetchLotBalancesForSortie() {
  type Row = { article_id: number; numero_lot: string; stock: number };
  const pageSize = 1000;
  const rows: Row[] = [];
  let from = 0;

  while (true) {
    const { data, error } = await supabaseServer.rpc("stock_mp_lot_balances").range(from, from + pageSize - 1);
    if (error) return [];
    const chunk = (data as Row[] | null) ?? [];
    rows.push(...chunk);
    if (chunk.length < pageSize) break;
    from += pageSize;
  }

  return rows;
}

export default async function MouvementsMatierePremiereSortiePage() {
  const currentStockUser = await getCurrentStockUser();
  const canWriteMouvements = await canWritePageUser(currentStockUser, "mouvementsMatierePremiereSortie");

  const [articlesData, lots] = await Promise.all([
    fetchAllArticlesForSortie(),
    fetchLotBalancesForSortie(),
  ]);

  const articles = articlesData.map((article) => ({
    id: article.id,
    label: article.nom_article,
    unite: article.unite || "",
  }));

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#edf8ff_0%,#f8fcff_48%,#ffffff_100%)] px-4 py-6 text-slate-900 lg:px-8">
      <div className="mx-auto w-full space-y-6">
        <section className="rounded-[1.75rem] border border-black/5 bg-white p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.16em] text-sky-700">
                ERP Rodis
              </p>
              <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-900">
                Sortie stock - Matiere Premiere
              </h1>
            </div>

            <div className="flex items-center gap-3">
              <BackButton href="/mouvements/matiere-premiere" label="Retour mouvements matiere premiere" />
              <RefreshButton />
            </div>
          </div>
        </section>

        <SortieMpClient articles={articles} lots={lots} canWrite={canWriteMouvements} />
      </div>
    </main>
  );
}
