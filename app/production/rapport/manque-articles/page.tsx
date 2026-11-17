import Link from "next/link";
import { unstable_noStore as noStore } from "next/cache";
import { BackButton } from "@/app/_components/back-button";
import { RefreshButton } from "@/app/_components/refresh-button";
import { ExportExcelButton } from "@/app/_components/export-excel-button";
import { supabaseServer } from "@/lib/supabase-server";
import { calculerCartonsAProduireGlobal } from "@/lib/composants-conditionnement";
import { fetchStockActuelMpDepotE, type StockActuelMpRow } from "../../../stock/matiere-premiere/rapport/capacite-conditionnement/capacite-lib";

type SearchParams = Promise<{ sousFamille?: string | string[] }>;

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
    const { data, error } = await query.order("id", { ascending: true }).range(from, from + pageSize - 1);
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

// Article fini dont le besoin en conditionnement ne peut pas etre calcule : pas de formule (Recette Conditionnement) ou formule sans
// "quantite de recette de base" (le Tableau de commande ignore alors ses recettes)
export type SansFormuleRow = {
  id: number;
  nom: string;
  gamme: string;
  commande: number;
  aProduire: number;
  motif: string;
};

export default async function ManqueArticlesPage({ searchParams }: { searchParams: SearchParams }) {
  noStore();
  const params = await searchParams;
  const sousFamilleFilter = new Set(
    Array.isArray(params.sousFamille) ? params.sousFamille : params.sousFamille ? [params.sousFamille] : []
  );

  // Meme calcul que les colonnes "articles de conditionnement" du Tableau de commande (lib/composants-conditionnement.ts) : toutes les
  // commandes non livrees (En cours, Stand, BL transforme), cartons A PRODUIRE = commande - stock produit fini ("comme la page Stock", les
  // articles du meme nom partagent leur stock) - programmes deja en cours (Qt en cours de Conditionnement : emballe pas encore en stock + reste
  // a conditionner / emballer), puis recette x cartons a produire / quantite de recette de base. Avant, cette page avait son propre calcul (stock
  // PF et programmes lus autrement, article par article) et ne montrait pas des manques que le Tableau de commande montrait.
  const { rows: articlesTous, error: articlesTousError } = await fetchAll<{
    id: number;
    nom_article: string | null;
    nature: string | null;
    gamme: string | null;
  }>("articles", "id, nom_article, nature, gamme");

  let cartonsParId = new Map<number, number>();
  let aProduire: (articleId: number) => number = () => 0;
  let calculError: string | null = null;
  try {
    const calcul = await calculerCartonsAProduireGlobal(
      articlesTous.map((article) => ({ id: article.id, nom_article: article.nom_article, nature: article.nature }))
    );
    cartonsParId = calcul.cartonsParId;
    aProduire = calcul.aProduire;
  } catch (e) {
    calculError = e instanceof Error ? e.message : "Calcul des cartons a produire impossible.";
  }
  const quantiteParArticle = cartonsParId;
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

  // Besoin en MP/Conditionnement = quantite de la recette x (cartons a produire / quantite_recette_base de l'article calibre). Comme le
  // Tableau de commande, un article dont la quantite de recette de base est absente n'est pas calcule : il est signale plus bas dans la liste
  // "Articles sans formule de conditionnement" (au lieu de compter la recette pour 1 carton).
  const besoinParMp = new Map<number, number>();
  for (const [articleId] of quantiteParArticle.entries()) {
    const article = articleById.get(articleId);
    const totalCartonsNet = aProduire(articleId);
    if (totalCartonsNet <= 0.000001) continue;
    if (!(Number(article?.quantite_recette_base ?? 0) > 0)) continue;

    const ratioCarton = totalCartonsNet / Number(article?.quantite_recette_base);
    for (const r of recettes.filter((r) => r.article_pf_id === articleId && Number(r.quantite) > 0)) {
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

  // Articles finis sans formule de conditionnement (Recette Conditionnement : aucune ligne avec une quantite > 0), ou avec une formule mais sans
  // quantite de recette de base (non calcules, voir plus haut). Ceux qui ont des commandes en cours d'abord : leur besoin en sleeve, capsule...
  // n'est pas dans les manques ci-dessus.
  const { rows: toutesRecettes, error: toutesRecettesError } = await fetchAll<{ article_pf_id: number; quantite: number | null }>(
    "recettes_pf",
    "id, article_pf_id, quantite"
  );
  const avecFormule = new Set(toutesRecettes.filter((r) => Number(r.quantite ?? 0) > 0).map((r) => r.article_pf_id));
  const sansFormule: SansFormuleRow[] = [];
  for (const article of articlesTous) {
    if (article.nature === "vrac") continue;
    const commande = quantiteParArticle.get(article.id) ?? 0;
    let motif: string | null = null;
    if (!avecFormule.has(article.id)) motif = "Pas de formule de conditionnement";
    else if (commande > 0 && !(Number(articleById.get(article.id)?.quantite_recette_base ?? 0) > 0)) {
      motif = "Formule sans quantite de recette de base";
    }
    if (!motif) continue;
    sansFormule.push({
      id: article.id,
      nom: article.nom_article ?? `Article #${article.id}`,
      gamme: article.gamme?.trim() || "-",
      commande: round(commande, 2),
      aProduire: round(aProduire(article.id), 2),
      motif,
    });
  }
  sansFormule.sort(
    (a, b) => b.commande - a.commande || a.nom.localeCompare(b.nom, "fr", { sensitivity: "base", numeric: true })
  );
  const sansFormuleAvecCommande = sansFormule.filter((row) => row.commande > 0);
  const sansFormuleSansCommande = sansFormule.filter((row) => row.commande <= 0);

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
    articlesTousError?.message ||
    calculError ||
    articlesFinisError?.message ||
    articlesVracError?.message ||
    recettesError?.message ||
    toutesRecettesError?.message ||
    sousFamilleError?.message ||
    null;

  const aucunManqueDuTout = !errorMessage && manqueMpToutes.length === 0 && manqueConditionnementToutes.length === 0;
  const aucunManqueApresFiltre =
    !errorMessage && !aucunManqueDuTout && manqueMp.length === 0 && manqueConditionnement.length === 0;
  const dateDuJour = new Date().toISOString().slice(0, 10);

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#edf8ff_0%,#f8fcff_48%,#ffffff_100%)] px-4 py-6 text-slate-900 lg:px-8">
      <div className="mx-auto w-full space-y-6">
        <section className="rounded-[1.75rem] border border-black/5 bg-white p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.16em] text-sky-700">ERP Rodis</p>
              <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-900">Manque Articles</h1>
              <p className="mt-2 text-sm text-slate-600">
                Meme calcul que le Tableau de commande : toutes les commandes en cours, BL transforme ou stand, cartons encore a produire (demande
                moins stock produit fini moins programmes deja en cours) passes dans les recettes de fabrication et de conditionnement, compares
                au stock actuel Depot E. Seuls les articles en manque sont affiches. Les articles sans formule de conditionnement sont listes en
                bas de page.
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
            <ManqueSection title="Manque - Matiere Premiere" rows={manqueMp} fichier={`manque-matiere-premiere-${dateDuJour}.xlsx`} />
            <ManqueSection title="Manque - Conditionnement" rows={manqueConditionnement} fichier={`manque-conditionnement-${dateDuJour}.xlsx`} />
          </>
        )}

        {!errorMessage ? (
          <SansFormuleSection
            avecCommande={sansFormuleAvecCommande}
            sansCommande={sansFormuleSansCommande}
            fichier={`articles-sans-formule-conditionnement-${dateDuJour}.xlsx`}
          />
        ) : null}
      </div>
    </main>
  );
}

function ManqueSection({ title, rows, fichier }: { title: string; rows: ManqueRow[]; fichier: string }) {
  if (rows.length === 0) return null;

  const colonnes = [
    { label: "Article", key: "nom" },
    { label: "Sous famille", key: "sousFamille" },
    { label: "Unite", key: "unite" },
    { label: "Besoin", key: "besoin" },
    { label: "Stock Depot E", key: "stock" },
    { label: "Manque", key: "manque" },
  ];

  return (
    <section className="overflow-hidden rounded-[1.75rem] border border-black/5 bg-white shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
      <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-6 py-4">
        <h2 className="text-lg font-bold text-slate-900">{title}</h2>
        <ExportExcelButton rows={rows.map((row) => ({ ...row }))} columns={colonnes} filename={fichier} />
      </div>
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

function TableauSansFormule({ rows }: { rows: SansFormuleRow[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-left text-sm">
        <thead className="bg-slate-50 text-slate-500">
          <tr>
            <th className="px-6 py-3 font-semibold">Article</th>
            <th className="px-6 py-3 font-semibold">Gamme</th>
            <th className="px-6 py-3 font-semibold">Cartons commandes</th>
            <th className="px-6 py-3 font-semibold">Cartons a produire</th>
            <th className="px-6 py-3 font-semibold">Probleme</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className="border-t border-slate-100">
              <td className="px-6 py-3 font-medium text-slate-900">{row.nom}</td>
              <td className="px-6 py-3 text-slate-600">{row.gamme}</td>
              <td className="px-6 py-3 text-slate-600">{row.commande.toLocaleString("fr-FR", { maximumFractionDigits: 2 })}</td>
              <td className="px-6 py-3 text-slate-600">{row.aProduire.toLocaleString("fr-FR", { maximumFractionDigits: 2 })}</td>
              <td className="px-6 py-3">
                <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-800">{row.motif}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// Articles finis sans formule de conditionnement : ceux qui ont des commandes en cours (leur besoin n'est PAS dans les manques) d'abord, les autres
// dans une liste repliee. L'export Excel contient tout.
function SansFormuleSection({
  avecCommande,
  sansCommande,
  fichier,
}: {
  avecCommande: SansFormuleRow[];
  sansCommande: SansFormuleRow[];
  fichier: string;
}) {
  const colonnes = [
    { label: "Article", key: "nom" },
    { label: "Gamme", key: "gamme" },
    { label: "Cartons commandes (en cours)", key: "commande" },
    { label: "Cartons a produire", key: "aProduire" },
    { label: "Probleme", key: "motif" },
  ];
  const toutes = [...avecCommande, ...sansCommande];

  return (
    <section className="overflow-hidden rounded-[1.75rem] border border-black/5 bg-white shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
      <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-6 py-4">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Articles sans formule de conditionnement</h2>
          <p className="mt-1 text-xs text-slate-500">
            {avecCommande.length} avec des commandes en cours (leur besoin en sleeve, capsule, etiquette... n&apos;est pas calcule), {sansCommande.length} sans
            commande. Ajoute leur Recette Conditionnement dans la fiche article.
          </p>
        </div>
        <ExportExcelButton rows={toutes.map((row) => ({ ...row }))} columns={colonnes} filename={fichier} />
      </div>
      {avecCommande.length > 0 ? (
        <TableauSansFormule rows={avecCommande} />
      ) : (
        <p className="px-6 py-4 text-sm font-medium text-emerald-700">Tous les articles qui ont des commandes en cours ont une formule.</p>
      )}
      {sansCommande.length > 0 ? (
        <details className="border-t border-slate-100">
          <summary className="cursor-pointer px-6 py-3 text-sm font-semibold text-sky-700">
            Autres articles sans formule, sans commande en cours ({sansCommande.length})
          </summary>
          <TableauSansFormule rows={sansCommande} />
        </details>
      ) : null}
    </section>
  );
}
