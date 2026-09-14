import Link from "next/link";
import { unstable_noStore as noStore } from "next/cache";
import { BackButton } from "@/app/_components/back-button";
import { RefreshButton } from "@/app/_components/refresh-button";
import { supabaseServer } from "@/lib/supabase-server";
import { fetchStockActuelMpDepotE, type StockActuelMpRow } from "../../../stock/matiere-premiere/rapport/capacite-conditionnement/capacite-lib";
import { fetchAllProgrammeLignes, fetchAllCartonEntries, groupCartonEntriesByLigne } from "../../suivi/data";

type SearchParams = Promise<{ sousFamille?: string | string[] }>;

type CommandeRow = { id: number; statut: string | null };
type CommandeLigneRow = { commande_id: number; article_id: number; quantite_demandee: number | null };
type ArticleRow = {
  id: number;
  nom_article: string;
  nature: string | null;
  quantite_recette_base: number | null;
  vrac_article_id: number | null;
  vrac_quantite_recette: number | null;
  contenance: number | null;
  piece_par_carton: number | null;
};
type RecetteLigneRow = { article_pf_id: number; article_mp_id: number; quantite: number };

function round(value: number, decimals = 3) {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

// Colorant (COLORANT PLAS. / Col_Cosm / Col_cosm), Base (categorie exacte
// "BASE") ET toute categorie MP generique (mot "MP" isole dans la categorie)
// -> vraie matiere premiere chimique. Tout le reste (Sleeve, Carton, Spray,
// Pump, Etiquette...) -> conditionnement. Meme regle que
// app/production/programme/[numero]/stock/actions.ts (categorieSousGroupe),
// deja utilisee pour separer MP/Conditionnement lors de la creation
// automatique de Transfer Order.
function estMatierePremiereChimique(categorie: string | null): boolean {
  const normalized = (categorie || "").trim().toUpperCase();
  const tokens = normalized.split(/[^A-Z0-9]+/).filter(Boolean);
  return (
    normalized.includes("COLORANT") ||
    normalized.includes("COL_COSM") ||
    normalized.includes("COL COSM") ||
    normalized === "BASE" ||
    tokens.includes("MP")
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function fetchAll<T>(table: string, select: string, filter?: (q: any) => any) {
  const rows: T[] = [];
  let from = 0;
  const pageSize = 1000;

  while (true) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let query: any = supabaseServer.from(table).select(select);
    if (filter) query = filter(query);
    const { data, error } = await query.range(from, from + pageSize - 1);
    if (error) return { rows, error };
    const chunk = (data ?? []) as T[];
    rows.push(...chunk);
    if (chunk.length < pageSize) break;
    from += pageSize;
  }

  return { rows, error: null };
}

export type ManqueRow = {
  id: number;
  nom: string;
  sousFamille: string;
  unite: string;
  besoin: number;
  stock: number;
  manque: number;
};

export default async function ManqueArticlesPage({ searchParams }: { searchParams: SearchParams }) {
  noStore();
  const params = await searchParams;
  const sousFamilleFilter = new Set(
    Array.isArray(params.sousFamille) ? params.sousFamille : params.sousFamille ? [params.sousFamille] : []
  );

  // "En cours" au sens large - toute commande client pas encore livree
  // consomme encore du stock (En cours, Stand, BL transforme, et les
  // valeurs historiques FIFO_PARTIEL/FIFO_CALCULE/SAISIE_WEB qui
  // s'affichent toutes comme "En cours" sur /commandes) - demande
  // explicite : "toutes les commandes qui sont en cours ou BL transforme
  // ou stand".
  const { rows: commandes, error: commandesError } = await fetchAll<CommandeRow>("commandes", "id, statut");
  const commandeIdsEnCours = commandes
    .filter((c) => String(c.statut || "").trim().toUpperCase() !== "LIVREE")
    .map((c) => c.id);

  const { rows: lignesRaw, error: lignesError } =
    commandeIdsEnCours.length > 0
      ? await fetchAll<CommandeLigneRow>("commande_lignes", "commande_id, article_id, quantite_demandee", (q) =>
          q.in("commande_id", commandeIdsEnCours)
        )
      : { rows: [] as CommandeLigneRow[], error: null };

  // Cumule le besoin en cartons du meme article fini sur TOUTES les
  // commandes en cours a la fois - une rupture n'a de sens qu'au niveau du
  // stock global disponible, pas commande par commande.
  const quantiteParArticle = new Map<number, number>();
  for (const ligne of lignesRaw) {
    quantiteParArticle.set(
      ligne.article_id,
      (quantiteParArticle.get(ligne.article_id) ?? 0) + Number(ligne.quantite_demandee ?? 0)
    );
  }
  const finishedArticleIds = [...quantiteParArticle.keys()];

  const { rows: articlesFinisRaw, error: articlesFinisError } =
    finishedArticleIds.length > 0
      ? await fetchAll<ArticleRow>(
          "articles",
          "id, nom_article, nature, quantite_recette_base, vrac_article_id, vrac_quantite_recette, contenance, piece_par_carton",
          (q) => q.in("id", finishedArticleIds)
        )
      : { rows: [] as ArticleRow[], error: null };

  const vracArticleIds = [...new Set(articlesFinisRaw.map((a) => a.vrac_article_id).filter((id): id is number => !!id))];
  const { rows: articlesVracRaw, error: articlesVracError } =
    vracArticleIds.length > 0
      ? await fetchAll<ArticleRow>(
          "articles",
          "id, nom_article, nature, quantite_recette_base, vrac_article_id, vrac_quantite_recette, contenance, piece_par_carton",
          (q) => q.in("id", vracArticleIds)
        )
      : { rows: [] as ArticleRow[], error: null };

  const articleById = new Map([...articlesFinisRaw, ...articlesVracRaw].map((a) => [a.id, a]));
  const recetteArticleIds = [...new Set([...finishedArticleIds, ...vracArticleIds])];
  const { rows: recettes, error: recettesError } =
    recetteArticleIds.length > 0
      ? await fetchAll<RecetteLigneRow>("recettes_pf", "article_pf_id, article_mp_id, quantite", (q) =>
          q.in("article_pf_id", recetteArticleIds)
        )
      : { rows: [] as RecetteLigneRow[], error: null };

  // Le stock de produit fini deja disponible couvre une partie de la
  // demande AVANT meme de fabriquer/conditionner quoi que ce soit -
  // demande explicite : "commande besoin 3000 carton, dans le stock ya 2000
  // carton, il faut voir le manque pour 1000 carton [pas 3000]". Meme calcul
  // que stock_actuel_pf_rows()/Stock Actuel PF (lots_stock, tous depots
  // confondus - pas de restriction depot pour le stock livrable a un
  // client, contrairement au Depot E pour la MP/conditionnement qui sert a
  // la faisabilite physique de production).
  const { rows: lotsPfRaw, error: lotsPfError } =
    finishedArticleIds.length > 0
      ? await fetchAll<{ article_id: number | null; qte_entree: number | null; qte_sortie: number | null }>(
          "lots_stock",
          "article_id, qte_entree, qte_sortie",
          (q) => q.in("article_id", finishedArticleIds)
        )
      : { rows: [] as { article_id: number | null; qte_entree: number | null; qte_sortie: number | null }[], error: null };
  const stockPfByArticleId = new Map<number, number>();
  for (const lot of lotsPfRaw) {
    if (lot.article_id == null) continue;
    stockPfByArticleId.set(
      lot.article_id,
      (stockPfByArticleId.get(lot.article_id) ?? 0) + Number(lot.qte_entree ?? 0) - Number(lot.qte_sortie ?? 0)
    );
  }

  // Un programme (PD) deja en cours pour un article compte aussi comme
  // "deja pris en charge", meme si son MP n'est pas encore physiquement
  // sorti du stock - demande explicite : "si ya PD meme si le MP c'est pas
  // encore sorti il faut enlever ca de la quantite". Reste a produire =
  // qt_carton de la ligne moins ce qui a deja ete saisi en Conditionnement
  // (production_carton_entries), 0 si la ligne/le carton est marque
  // termine - meme principe que "Reste" sur Suivi par Etape
  // (app/production/suivi/en-cours/page.tsx), en agrege par article plutot
  // que par code/lot (suffisant pour une estimation de manque MP, pas un
  // suivi de production precis).
  const { rows: lignesActives, error: lignesActivesError } = await fetchAllProgrammeLignes({ activeOnly: true });
  const lignesActivesPourArticles = lignesActives.filter(
    (l) => l.article_id != null && finishedArticleIds.includes(l.article_id)
  );
  const cartonEntries = await fetchAllCartonEntries(lignesActivesPourArticles.map((l) => l.id));
  const entriesByLigne = groupCartonEntriesByLigne(cartonEntries);
  const programmeResteParArticle = new Map<number, number>();
  for (const ligne of lignesActivesPourArticles) {
    if (ligne.article_id == null) continue;
    if (ligne.programme_termine || ligne.carton_termine) continue;
    const produit = (entriesByLigne.get(ligne.id) ?? []).reduce((sum, e) => sum + Number(e.quantite ?? 0), 0);
    const reste = Math.max(0, Number(ligne.qt_carton ?? 0) - produit);
    programmeResteParArticle.set(ligne.article_id, (programmeResteParArticle.get(ligne.article_id) ?? 0) + reste);
  }

  // Besoin en MP/Conditionnement = quantite de la recette x (qt encore a
  // produire / quantite_recette_base de l'article calibre) - meme logique
  // que app/production/programme/[numero]/stock/page.tsx, mais a partir du
  // cumul des commandes en cours plutot que d'un programme deja lance.
  // quantite_recette_base absente -> recette consideree calibree pour 1
  // carton (meme repli que sur les pages Recette Conditionnement/
  // Fabrication), au lieu de ne rien calculer du tout.
  const besoinParMp = new Map<number, number>();
  for (const [articleId, totalCartons] of quantiteParArticle.entries()) {
    const article = articleById.get(articleId);
    const totalCartonsNet = Math.max(
      0,
      totalCartons - (stockPfByArticleId.get(articleId) ?? 0) - (programmeResteParArticle.get(articleId) ?? 0)
    );
    if (totalCartonsNet <= 0) continue;

    const ratioCarton = totalCartonsNet / (article?.quantite_recette_base || 1);
    for (const r of recettes.filter((r) => r.article_pf_id === articleId)) {
      besoinParMp.set(r.article_mp_id, (besoinParMp.get(r.article_mp_id) ?? 0) + r.quantite * ratioCarton);
    }

    if (article?.vrac_article_id) {
      const vracArticle = articleById.get(article.vrac_article_id);
      // Meme repli "auto" que la page Recette Conditionnement : sans
      // vrac_quantite_recette saisi a la main, le vrac necessaire se
      // deduit de contenance x piece_par_carton x quantite_recette_base.
      const qtVracAuto =
        article.contenance && article.piece_par_carton
          ? (article.quantite_recette_base || 1) * article.piece_par_carton * article.contenance
          : null;
      const qtVracParBase = article.vrac_quantite_recette ?? qtVracAuto ?? 0;
      const vracParCarton = qtVracParBase / (article.quantite_recette_base || 1);
      const vracNecessaireTotal = vracParCarton * totalCartonsNet;
      const ratioVrac = vracNecessaireTotal / (vracArticle?.quantite_recette_base || 1);
      for (const r of recettes.filter((r) => r.article_pf_id === article.vrac_article_id)) {
        besoinParMp.set(r.article_mp_id, (besoinParMp.get(r.article_mp_id) ?? 0) + r.quantite * ratioVrac);
      }
    }
  }

  const mpIds = [...besoinParMp.keys()];
  const [stockRows, { rows: sousFamilleRows, error: sousFamilleError }] = await Promise.all([
    mpIds.length > 0 ? fetchStockActuelMpDepotE() : Promise.resolve([] as StockActuelMpRow[]),
    mpIds.length > 0
      ? fetchAll<{ id: number; sous_famille: string | null }>("articles_matiere_premiere", "id, sous_famille", (q) =>
          q.in("id", mpIds)
        )
      : Promise.resolve({ rows: [] as { id: number; sous_famille: string | null }[], error: null }),
  ]);
  const stockById = new Map(stockRows.map((s) => [s.article_id, s]));
  const sousFamilleById = new Map(sousFamilleRows.map((s) => [s.id, s.sous_famille]));

  const manqueMpToutes: ManqueRow[] = [];
  const manqueConditionnementToutes: ManqueRow[] = [];
  for (const mpId of mpIds) {
    const stockInfo = stockById.get(mpId);
    const besoin = besoinParMp.get(mpId) ?? 0;
    const stock = stockInfo?.stock_actuel ?? 0;
    const manqueBrut = besoin - stock;
    if (manqueBrut <= 0.001) continue;

    const estChimique = estMatierePremiereChimique(stockInfo?.categorie ?? null);
    // Article de conditionnement = piece entiere, jamais une fraction -
    // meme regle que autoCreateTransferOrdersAction (categorieSousGroupe).
    const row: ManqueRow = {
      id: mpId,
      nom: stockInfo?.nom_article ?? `Article #${mpId}`,
      sousFamille: sousFamilleById.get(mpId)?.trim() || "-",
      unite: stockInfo?.unite ?? "-",
      besoin: round(besoin),
      stock: round(stock),
      manque: estChimique ? round(manqueBrut) : Math.ceil(manqueBrut),
    };
    (estChimique ? manqueMpToutes : manqueConditionnementToutes).push(row);
  }

  manqueMpToutes.sort((a, b) => a.nom.localeCompare(b.nom, "fr", { sensitivity: "base" }));
  manqueConditionnementToutes.sort((a, b) => a.nom.localeCompare(b.nom, "fr", { sensitivity: "base" }));

  // Options du filtre "Sous famille" - uniquement les valeurs qui
  // apparaissent reellement parmi les manques trouves (pas tout le
  // catalogue), meme principe que buildOptions() ailleurs dans l'app.
  const sousFamilleOptions = [
    ...new Set([...manqueMpToutes, ...manqueConditionnementToutes].map((r) => r.sousFamille)),
  ].sort((a, b) => a.localeCompare(b, "fr", { sensitivity: "base" }));

  const manqueMp =
    sousFamilleFilter.size > 0 ? manqueMpToutes.filter((r) => sousFamilleFilter.has(r.sousFamille)) : manqueMpToutes;
  const manqueConditionnement =
    sousFamilleFilter.size > 0
      ? manqueConditionnementToutes.filter((r) => sousFamilleFilter.has(r.sousFamille))
      : manqueConditionnementToutes;

  const errorMessage =
    commandesError?.message ||
    lignesError?.message ||
    articlesFinisError?.message ||
    articlesVracError?.message ||
    recettesError?.message ||
    lotsPfError?.message ||
    lignesActivesError ||
    sousFamilleError?.message ||
    null;

  const aucunManqueDuTout = !errorMessage && manqueMpToutes.length === 0 && manqueConditionnementToutes.length === 0;
  const aucunManqueApresFiltre =
    !errorMessage && !aucunManqueDuTout && manqueMp.length === 0 && manqueConditionnement.length === 0;

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#edf8ff_0%,#f8fcff_48%,#ffffff_100%)] px-4 py-6 text-slate-900 lg:px-8">
      <div className="mx-auto w-full space-y-6">
        <section className="rounded-[1.75rem] border border-black/5 bg-white p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.16em] text-sky-700">ERP Rodis</p>
              <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-900">Manque Articles</h1>
              <p className="mt-2 text-sm text-slate-600">
                Toutes les commandes en cours, BL transforme ou stand : quantite encore a produire (demande
                moins stock produit fini deja disponible moins ce que les programmes deja en cours vont
                encore produire) passee dans les recettes de fabrication et de conditionnement, comparee au
                stock actuel Depot E. Seuls les articles en manque sont affiches.
              </p>
            </div>

            <div className="flex items-center gap-3">
              <BackButton href="/production/rapport" label="Retour rapport" />
              <RefreshButton />
            </div>
          </div>
        </section>

        {sousFamilleOptions.length > 0 ? (
          <section className="rounded-[1.75rem] border border-black/5 bg-white p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
            <form className="grid gap-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Sous famille</p>
              <div className="flex flex-wrap gap-3">
                {sousFamilleOptions.map((option) => (
                  <label
                    key={option}
                    className="flex items-center gap-2 rounded-2xl border border-slate-200 px-4 py-2 text-sm text-slate-700"
                  >
                    <input
                      type="checkbox"
                      name="sousFamille"
                      value={option}
                      defaultChecked={sousFamilleFilter.has(option)}
                    />
                    {option}
                  </label>
                ))}
              </div>
              <div className="flex items-center gap-3">
                <button
                  type="submit"
                  className="rounded-2xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white"
                >
                  Filtrer
                </button>
                {sousFamilleFilter.size > 0 ? (
                  <Link
                    href="/production/rapport/manque-articles"
                    className="rounded-2xl border border-slate-200 px-5 py-3 text-center text-sm font-semibold text-slate-700"
                  >
                    Effacer
                  </Link>
                ) : null}
              </div>
            </form>
          </section>
        ) : null}

        {errorMessage ? (
          <div className="rounded-[1.75rem] border border-red-200 bg-red-50 px-6 py-4 text-sm font-medium text-red-700">
            {errorMessage}
          </div>
        ) : aucunManqueDuTout ? (
          <div className="rounded-[1.75rem] border border-emerald-200 bg-emerald-50 px-6 py-4 text-sm font-semibold text-emerald-800">
            Aucun manque - le stock Depot E couvre tout le besoin des commandes en cours.
          </div>
        ) : aucunManqueApresFiltre ? (
          <div className="rounded-[1.75rem] border border-amber-200 bg-amber-50 px-6 py-4 text-sm font-semibold text-amber-800">
            Aucun manque pour les sous-familles selectionnees.
          </div>
        ) : (
          <>
            <ManqueSection title="Manque - Matiere Premiere" rows={manqueMp} />
            <ManqueSection title="Manque - Conditionnement" rows={manqueConditionnement} />
          </>
        )}
      </div>
    </main>
  );
}

function ManqueSection({ title, rows }: { title: string; rows: ManqueRow[] }) {
  if (rows.length === 0) return null;

  return (
    <section className="overflow-hidden rounded-[1.75rem] border border-black/5 bg-white shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
      <h2 className="border-b border-slate-100 px-6 py-4 text-lg font-bold text-slate-900">{title}</h2>
      <div className="overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-slate-50 text-slate-500">
            <tr>
              <th className="px-6 py-4 font-semibold">Article</th>
              <th className="px-6 py-4 font-semibold">Sous famille</th>
              <th className="px-6 py-4 font-semibold">Unite</th>
              <th className="px-6 py-4 font-semibold">Besoin</th>
              <th className="px-6 py-4 font-semibold">Stock Depot E</th>
              <th className="px-6 py-4 font-semibold">Manque</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-t border-slate-100">
                <td className="px-6 py-4 font-medium text-slate-900">{row.nom}</td>
                <td className="px-6 py-4 text-slate-600">{row.sousFamille}</td>
                <td className="px-6 py-4 text-slate-600">{row.unite}</td>
                <td className="px-6 py-4 text-slate-600">
                  {row.besoin.toLocaleString("fr-FR", { maximumFractionDigits: 3 })}
                </td>
                <td className="px-6 py-4 text-slate-600">
                  {row.stock.toLocaleString("fr-FR", { maximumFractionDigits: 3 })}
                </td>
                <td className="px-6 py-4">
                  <span className="rounded-full bg-red-50 px-3 py-1 text-xs font-semibold text-red-700">
                    {row.manque.toLocaleString("fr-FR", { maximumFractionDigits: 3 })}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
