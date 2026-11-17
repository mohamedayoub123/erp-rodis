import Link from "next/link";
import { unstable_noStore as noStore } from "next/cache";
import { BackButton } from "@/app/_components/back-button";
import { RefreshButton } from "@/app/_components/refresh-button";
import { ExportExcelButton } from "@/app/_components/export-excel-button";
import { supabaseServer } from "@/lib/supabase-server";
import { calculerCartonsAProduireGlobal } from "@/lib/composants-conditionnement";

// Commandes par TYPE de produit fini (champ "Type" de la fiche article : hydratant, clarifiant, gel douche, pommade...) : on choisit le type, la page
// donne tous les articles de ce type qui sont commandes avec la quantite de chaque client, le total, le stock, les programmes en cours et le reste a
// fabriquer. Meme calcul que le Tableau de commande (lib/composants-conditionnement.ts) : toutes les commandes non livrees (En cours, Stand, BL
// transforme), stock PF comme la page Stock (les articles du meme nom partagent leur stock), programmes en cours = emballe pas encore en stock + reste
// a conditionner / emballer, reste a fabriquer = max(0, commande - stock - en cours).

type SearchParams = Promise<{ type?: string }>;

type ArticleLu = { id: number; nom_article: string | null; nature: string | null; type_article: string | null; gamme: string | null };
type CommandeLue = { id: number; client: string | null; statut: string | null };

const TOUS = "__tous__";
const SANS_TYPE = "__sans_type__";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function fetchAll<T>(table: string, select: string, filter?: (q: any) => any) {
  const rows: T[] = [];
  for (let from = 0; ; from += 1000) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let query: any = supabaseServer.from(table).select(select);
    if (filter) query = filter(query);
    const { data, error } = await query.order("id", { ascending: true }).range(from, from + 999);
    if (error) return { rows, error: error.message as string };
    const page = (data ?? []) as T[];
    rows.push(...page);
    if (page.length < 1000) break;
  }
  return { rows, error: null as string | null };
}

function cleType(typeArticle: string | null): string {
  const type = (typeArticle ?? "").trim().toLowerCase();
  return type || SANS_TYPE;
}

function libelleType(cle: string, exemples: Map<string, string>): string {
  if (cle === SANS_TYPE) return "Sans type";
  const exemple = exemples.get(cle) ?? cle;
  return exemple.charAt(0).toUpperCase() + exemple.slice(1);
}

function formater(valeur: number): string {
  return valeur.toLocaleString("fr-FR", { maximumFractionDigits: 2 });
}

type LigneArticle = {
  cle: string;
  nom: string;
  type: string;
  ids: number[];
  total: number;
  parClient: Map<string, number>;
};

export default async function CommandesParTypePage({ searchParams }: { searchParams: SearchParams }) {
  noStore();
  const params = await searchParams;
  const typeChoisi = String(params.type || "").trim();

  const [{ rows: articlesTous, error: articlesErreur }, { rows: commandes, error: commandesErreur }] = await Promise.all([
    fetchAll<ArticleLu>("articles", "id, nom_article, nature, type_article, gamme"),
    fetchAll<CommandeLue>("commandes", "id, client, statut", (q) => q.neq("statut", "LIVREE")),
  ]);
  const articlesFinis = articlesTous.filter((article) => article.nature !== "vrac");
  const articleParId = new Map(articlesFinis.map((article) => [article.id, article]));
  const exemplesDeType = new Map<string, string>();
  for (const article of articlesFinis) {
    const type = (article.type_article ?? "").trim();
    if (type && !exemplesDeType.has(type.toLowerCase())) exemplesDeType.set(type.toLowerCase(), type);
  }

  // Les articles du type choisi (ou tous) : seul le stock de ceux-la est lu
  const idsDuType = new Set(
    articlesFinis
      .filter((article) => typeChoisi === TOUS || (typeChoisi !== "" && cleType(article.type_article) === typeChoisi))
      .map((article) => article.id)
  );

  let calcul: Awaited<ReturnType<typeof calculerCartonsAProduireGlobal>> | null = null;
  let calculErreur: string | null = null;
  try {
    calcul = await calculerCartonsAProduireGlobal(
      articlesTous.map((article) => ({ id: article.id, nom_article: article.nom_article, nature: article.nature })),
      { articleIds: idsDuType }
    );
  } catch (e) {
    calculErreur = e instanceof Error ? e.message : "Calcul impossible.";
  }
  const erreur = articlesErreur || commandesErreur || calculErreur;

  const clientParCommande = new Map<number, string>();
  for (const commande of commandes) clientParCommande.set(commande.id, (commande.client ?? "").trim() || "(sans client)");

  // Resume par type : articles commandes et cartons commandes (toutes les commandes non livrees)
  const resumeParType = new Map<string, { articles: Set<number>; cartons: number; clients: Set<string> }>();
  // Detail du type choisi, une ligne par NOM d'article (les articles du meme nom partagent stock et programmes)
  const lignesArticle = new Map<string, LigneArticle>();
  const clients = new Map<string, number>();
  for (const ligne of calcul?.lignes ?? []) {
    const article = ligne.article_id ? articleParId.get(ligne.article_id) : undefined;
    const cartons = Number(ligne.quantite_demandee ?? 0);
    if (!article || !(cartons > 0)) continue;
    const type = cleType(article.type_article);
    const client = clientParCommande.get(ligne.commande_id);
    if (!client) continue;

    const resume = resumeParType.get(type) ?? { articles: new Set<number>(), cartons: 0, clients: new Set<string>() };
    resume.articles.add(article.id);
    resume.cartons += cartons;
    resume.clients.add(client);
    resumeParType.set(type, resume);

    if (!idsDuType.has(article.id)) continue;
    const cle = calcul?.cleParId.get(article.id) ?? String(article.id);
    const detail = lignesArticle.get(cle) ?? {
      cle,
      nom: article.nom_article ?? `Article #${article.id}`,
      type,
      ids: [] as number[],
      total: 0,
      parClient: new Map<string, number>(),
    };
    if (!detail.ids.includes(article.id)) detail.ids.push(article.id);
    detail.total += cartons;
    detail.parClient.set(client, (detail.parClient.get(client) ?? 0) + cartons);
    lignesArticle.set(cle, detail);
    clients.set(client, (clients.get(client) ?? 0) + cartons);
  }

  const types = [...resumeParType.entries()].sort((a, b) => b[1].cartons - a[1].cartons);
  const colonnesClients = [...clients.keys()].sort((a, b) => a.localeCompare(b, "fr", { sensitivity: "base" }));
  const lignes = [...lignesArticle.values()]
    .sort((a, b) => a.nom.localeCompare(b.nom, "fr", { sensitivity: "base", numeric: true }))
    .map((detail) => {
      const stock = calcul?.stockPfParNom.get(detail.cle) ?? 0;
      const enCours = calcul?.qtEnCoursParNom.get(detail.cle) ?? 0;
      // meme fonction que le Tableau de commande : le manque du nom reparti entre ses articles (la somme = max(0, commande - stock - en cours))
      const reste = detail.ids.reduce((somme, id) => somme + (calcul?.aProduire(id) ?? 0), 0);
      return { ...detail, stock, enCours, reste: Math.round(reste * 100) / 100 };
    });
  const totaux = lignes.reduce(
    (somme, ligne) => ({
      total: somme.total + ligne.total,
      stock: somme.stock + Math.max(0, ligne.stock),
      enCours: somme.enCours + Math.max(0, ligne.enCours),
      reste: somme.reste + ligne.reste,
    }),
    { total: 0, stock: 0, enCours: 0, reste: 0 }
  );

  const titreType = typeChoisi === TOUS ? "Tous les types" : libelleType(typeChoisi, exemplesDeType);
  const colonnesExport = [
    { label: "Article", key: "article" },
    ...colonnesClients.map((client, index) => ({ label: client, key: `client${index}` })),
    { label: "Total commande", key: "total" },
    { label: "Stock PF", key: "stock" },
    { label: "Programme en cours", key: "enCours" },
    { label: "Reste a fabriquer", key: "reste" },
  ];
  const lignesExport = lignes.map((ligne) => ({
    article: ligne.nom,
    ...Object.fromEntries(colonnesClients.map((client, index) => [`client${index}`, ligne.parClient.get(client) ?? 0])),
    total: ligne.total,
    stock: ligne.stock,
    enCours: ligne.enCours,
    reste: ligne.reste,
  }));
  const dateDuJour = new Date().toISOString().slice(0, 10);

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#f4efe5_0%,#fbf8f2_45%,#ffffff_100%)] px-4 py-6 text-slate-900 lg:px-8">
      <div className="mx-auto w-full space-y-6">
        <section className="rounded-[1.75rem] border border-black/5 bg-white p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.16em] text-blue-700">Gestion Stock PF</p>
              <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-900">Commandes par type de produit fini</h1>
              <p className="mt-2 max-w-3xl text-sm text-slate-600">
                Choisis un type : tous les articles de ce type qui sont commandes (commandes non livrees : en cours, stand, BL transforme), avec la
                quantite de chaque client, le total, le stock, les programmes en cours et le reste a fabriquer. Meme calcul que le Tableau de commande.
              </p>
            </div>
            <div className="flex items-center gap-3">
              <BackButton href="/tableau-commandes" label="Retour tableau" />
              <RefreshButton />
            </div>
          </div>
        </section>

        {erreur ? (
          <div className="rounded-[1.75rem] border border-red-200 bg-red-50 px-6 py-4 text-sm font-medium text-red-700">{erreur}</div>
        ) : null}

        <section className="rounded-[1.75rem] border border-black/5 bg-white p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Type de produit fini</p>
          <div className="flex flex-wrap gap-3">
            {types.map(([cle, resume]) => (
              <Link
                key={cle}
                href={`/tableau-commandes/par-type?type=${encodeURIComponent(cle)}`}
                className={`rounded-2xl border px-4 py-2 text-sm font-semibold transition ${
                  typeChoisi === cle ? "border-slate-950 bg-slate-950 text-white" : "border-slate-200 text-slate-700 hover:border-slate-400"
                }`}
              >
                {libelleType(cle, exemplesDeType)}
                <span className={`ml-2 text-xs font-medium ${typeChoisi === cle ? "text-slate-300" : "text-slate-500"}`}>
                  {resume.articles.size} articles - {formater(resume.cartons)} cartons
                </span>
              </Link>
            ))}
            <Link
              href={`/tableau-commandes/par-type?type=${TOUS}`}
              className={`rounded-2xl border px-4 py-2 text-sm font-semibold transition ${
                typeChoisi === TOUS ? "border-slate-950 bg-slate-950 text-white" : "border-dashed border-slate-300 text-slate-600 hover:border-slate-400"
              }`}
            >
              Tous les types
            </Link>
          </div>
          {types.length === 0 && !erreur ? <p className="mt-3 text-sm text-slate-500">Aucune commande en cours.</p> : null}
        </section>

        {typeChoisi && !erreur ? (
          <section className="overflow-hidden rounded-[1.75rem] border border-black/5 bg-white shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
            <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-6 py-4">
              <div>
                <h2 className="text-lg font-bold text-slate-900">{titreType}</h2>
                <p className="mt-1 text-xs text-slate-500">
                  {lignes.length} articles commandes par {colonnesClients.length} clients - reste a fabriquer total {formater(totaux.reste)} cartons
                </p>
              </div>
              <ExportExcelButton
                rows={lignesExport}
                columns={colonnesExport}
                filename={`commandes-par-type-${typeChoisi === TOUS ? "tous" : typeChoisi.replace(/[^a-z0-9]+/gi, "-")}-${dateDuJour}.xlsx`}
              />
            </div>
            {lignes.length === 0 ? (
              <p className="px-6 py-6 text-sm text-slate-500">Aucun article de ce type n&apos;est commande en ce moment.</p>
            ) : (
              <div className="max-h-[75vh] overflow-auto">
                <table className="min-w-full border-separate border-spacing-0 text-left text-sm">
                  <thead className="text-slate-500">
                    <tr>
                      <th className="sticky left-0 top-0 z-20 border-b border-slate-200 bg-slate-50 px-4 py-3 font-semibold">Article</th>
                      {colonnesClients.map((client) => (
                        <th key={client} className="sticky top-0 z-10 border-b border-slate-200 bg-slate-50 px-3 py-3 text-right font-semibold">
                          {client}
                        </th>
                      ))}
                      <th className="sticky top-0 z-10 border-b border-slate-200 bg-slate-100 px-4 py-3 text-right font-semibold text-slate-700">Total commande</th>
                      <th className="sticky top-0 z-10 border-b border-slate-200 bg-slate-50 px-4 py-3 text-right font-semibold">Stock PF</th>
                      <th className="sticky top-0 z-10 border-b border-slate-200 bg-slate-50 px-4 py-3 text-right font-semibold">Programme en cours</th>
                      <th className="sticky top-0 z-10 border-b border-slate-200 bg-slate-100 px-4 py-3 text-right font-semibold text-slate-700">Reste a fabriquer</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lignes.map((ligne) => (
                      <tr key={ligne.cle} className="hover:bg-slate-50">
                        <td className="sticky left-0 border-b border-slate-100 bg-white px-4 py-3 font-medium text-slate-900">{ligne.nom}</td>
                        {colonnesClients.map((client) => (
                          <td key={client} className="border-b border-slate-100 px-3 py-3 text-right text-slate-700">
                            {ligne.parClient.has(client) ? formater(ligne.parClient.get(client) ?? 0) : ""}
                          </td>
                        ))}
                        <td className="border-b border-slate-100 bg-slate-50 px-4 py-3 text-right font-bold text-slate-900">{formater(ligne.total)}</td>
                        <td className={`border-b border-slate-100 px-4 py-3 text-right ${ligne.stock < 0 ? "font-semibold text-red-600" : "text-slate-700"}`}>
                          {formater(ligne.stock)}
                        </td>
                        <td className="border-b border-slate-100 px-4 py-3 text-right text-slate-700">{formater(ligne.enCours)}</td>
                        <td
                          className={`border-b border-slate-100 bg-slate-50 px-4 py-3 text-right font-bold ${
                            ligne.reste > 0 ? "text-red-600" : "text-emerald-700"
                          }`}
                        >
                          {formater(ligne.reste)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="font-bold text-slate-900">
                      <td className="sticky bottom-0 left-0 z-10 border-t border-slate-300 bg-slate-100 px-4 py-3">Total</td>
                      {colonnesClients.map((client) => (
                        <td key={client} className="sticky bottom-0 border-t border-slate-300 bg-slate-100 px-3 py-3 text-right">
                          {formater(clients.get(client) ?? 0)}
                        </td>
                      ))}
                      <td className="sticky bottom-0 border-t border-slate-300 bg-slate-200 px-4 py-3 text-right">{formater(totaux.total)}</td>
                      <td className="sticky bottom-0 border-t border-slate-300 bg-slate-100 px-4 py-3 text-right">{formater(totaux.stock)}</td>
                      <td className="sticky bottom-0 border-t border-slate-300 bg-slate-100 px-4 py-3 text-right">{formater(totaux.enCours)}</td>
                      <td className="sticky bottom-0 border-t border-slate-300 bg-slate-200 px-4 py-3 text-right text-red-600">{formater(totaux.reste)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </section>
        ) : null}
      </div>
    </main>
  );
}
