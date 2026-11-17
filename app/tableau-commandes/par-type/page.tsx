import Link from "next/link";
import { unstable_noStore as noStore } from "next/cache";
import { BackButton } from "@/app/_components/back-button";
import { RefreshButton } from "@/app/_components/refresh-button";
import { ExportExcelButton } from "@/app/_components/export-excel-button";
import { supabaseServer } from "@/lib/supabase-server";
import { calculerCartonsAProduireGlobal } from "@/lib/composants-conditionnement";

// Commandes par TYPE de produit fini (champ "Type" de la fiche article : hydratant, clarifiant, gel douche, pommade...) : on choisit le type, la page
// donne tous les articles de ce type qui sont commandes avec la quantite de chaque client, le total, le stock, ce qui restera en stock apres les
// commandes, les programmes en cours et le reste a fabriquer. Meme calcul que le Tableau de commande (lib/composants-conditionnement.ts) : toutes les
// commandes non livrees (En cours, Stand, BL transforme), stock PF comme la page Stock (les articles du meme nom partagent leur stock), programmes en
// cours = emballe pas encore en stock + reste a conditionner / emballer, reste a fabriquer = max(0, commande - stock - en cours).

type SearchParams = Promise<{ type?: string }>;

type ArticleLu = { id: number; nom_article: string | null; nature: string | null; type_article: string | null; gamme: string | null };
type CommandeLue = { id: number; client: string | null; statut: string | null };

const TOUS = "__tous__";
const SANS_TYPE = "__sans_type__";

// Une couleur par type (classes ecrites en entier : Tailwind ne detecte que les classes completes)
const COULEURS_TYPE = [
  { actif: "border-sky-600 bg-sky-600 text-white", inactif: "border-sky-200 bg-sky-50 text-sky-900 hover:border-sky-500" },
  { actif: "border-emerald-600 bg-emerald-600 text-white", inactif: "border-emerald-200 bg-emerald-50 text-emerald-900 hover:border-emerald-500" },
  { actif: "border-amber-500 bg-amber-500 text-white", inactif: "border-amber-200 bg-amber-50 text-amber-900 hover:border-amber-500" },
  { actif: "border-violet-600 bg-violet-600 text-white", inactif: "border-violet-200 bg-violet-50 text-violet-900 hover:border-violet-500" },
  { actif: "border-rose-600 bg-rose-600 text-white", inactif: "border-rose-200 bg-rose-50 text-rose-900 hover:border-rose-500" },
  { actif: "border-teal-600 bg-teal-600 text-white", inactif: "border-teal-200 bg-teal-50 text-teal-900 hover:border-teal-500" },
  { actif: "border-orange-500 bg-orange-500 text-white", inactif: "border-orange-200 bg-orange-50 text-orange-900 hover:border-orange-500" },
  { actif: "border-indigo-600 bg-indigo-600 text-white", inactif: "border-indigo-200 bg-indigo-50 text-indigo-900 hover:border-indigo-500" },
];

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

function Carte({ titre, valeur, detail, classes }: { titre: string; valeur: string; detail?: string; classes: string }) {
  return (
    <div className={`rounded-2xl border-l-4 px-4 py-3 shadow-sm ${classes}`}>
      <p className="text-[11px] font-semibold uppercase tracking-wide opacity-70">{titre}</p>
      <p className="mt-1 text-2xl font-black">{valeur}</p>
      {detail ? <p className="mt-0.5 text-xs font-medium opacity-70">{detail}</p> : null}
    </div>
  );
}

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
      // Ce qui restera en stock une fois toutes les commandes livrees (negatif = il manquera ce nombre de cartons, meme avec le programme en cours)
      const apres = Math.round((stock - detail.total) * 100) / 100;
      return { ...detail, stock, enCours, apres, reste: Math.round(reste * 100) / 100 };
    });
  const totaux = lignes.reduce(
    (somme, ligne) => ({
      total: somme.total + ligne.total,
      stock: somme.stock + Math.max(0, ligne.stock),
      enCours: somme.enCours + Math.max(0, ligne.enCours),
      apres: somme.apres + ligne.apres,
      reste: somme.reste + ligne.reste,
      enRupture: somme.enRupture + (ligne.apres < 0 ? 1 : 0),
    }),
    { total: 0, stock: 0, enCours: 0, apres: 0, reste: 0, enRupture: 0 }
  );

  const titreType = typeChoisi === TOUS ? "Tous les types" : libelleType(typeChoisi, exemplesDeType);
  const colonnesExport = [
    { label: "Article", key: "article" },
    ...colonnesClients.map((client, index) => ({ label: client, key: `client${index}` })),
    { label: "Total commande", key: "total" },
    { label: "Stock PF", key: "stock" },
    { label: "Programme en cours", key: "enCours" },
    { label: "Stock apres commande", key: "apres" },
    { label: "Reste a fabriquer", key: "reste" },
  ];
  const lignesExport = lignes.map((ligne) => ({
    article: ligne.nom,
    ...Object.fromEntries(colonnesClients.map((client, index) => [`client${index}`, ligne.parClient.get(client) ?? 0])),
    total: ligne.total,
    stock: ligne.stock,
    enCours: ligne.enCours,
    apres: ligne.apres,
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
                quantite de chaque client, le total, le stock, ce qui restera en stock apres les commandes, les programmes en cours et le reste a
                fabriquer. Meme calcul que le Tableau de commande.
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
            {types.map(([cle, resume], index) => {
              const couleur = COULEURS_TYPE[index % COULEURS_TYPE.length];
              const actif = typeChoisi === cle;
              return (
                <Link
                  key={cle}
                  href={`/tableau-commandes/par-type?type=${encodeURIComponent(cle)}`}
                  className={`rounded-2xl border px-4 py-2 text-sm font-bold shadow-sm transition ${actif ? couleur.actif : couleur.inactif}`}
                >
                  {libelleType(cle, exemplesDeType)}
                  <span className={`ml-2 text-xs font-medium ${actif ? "text-white/80" : "opacity-70"}`}>
                    {resume.articles.size} articles - {formater(resume.cartons)} cartons
                  </span>
                </Link>
              );
            })}
            <Link
              href={`/tableau-commandes/par-type?type=${TOUS}`}
              className={`rounded-2xl border px-4 py-2 text-sm font-bold shadow-sm transition ${
                typeChoisi === TOUS ? "border-slate-900 bg-slate-900 text-white" : "border-dashed border-slate-400 bg-white text-slate-700 hover:border-slate-700"
              }`}
            >
              Tous les types
            </Link>
          </div>
          {types.length === 0 && !erreur ? <p className="mt-3 text-sm text-slate-500">Aucune commande en cours.</p> : null}
        </section>

        {typeChoisi && !erreur ? (
          <>
            {lignes.length > 0 ? (
              <section className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
                <Carte titre="Articles commandes" valeur={String(lignes.length)} detail={`${colonnesClients.length} clients`} classes="border-slate-500 bg-slate-50 text-slate-900" />
                <Carte titre="Total commande" valeur={formater(totaux.total)} detail="cartons" classes="border-indigo-500 bg-indigo-50 text-indigo-900" />
                <Carte titre="Stock PF" valeur={formater(totaux.stock)} detail="cartons" classes="border-emerald-500 bg-emerald-50 text-emerald-900" />
                <Carte titre="Programme en cours" valeur={formater(totaux.enCours)} detail="cartons" classes="border-amber-500 bg-amber-50 text-amber-900" />
                <Carte
                  titre="En rupture apres commande"
                  valeur={String(totaux.enRupture)}
                  detail="articles"
                  classes={totaux.enRupture > 0 ? "border-red-500 bg-red-50 text-red-800" : "border-emerald-500 bg-emerald-50 text-emerald-900"}
                />
                <Carte
                  titre="Reste a fabriquer"
                  valeur={formater(totaux.reste)}
                  detail="cartons"
                  classes={totaux.reste > 0 ? "border-rose-500 bg-rose-50 text-rose-800" : "border-emerald-500 bg-emerald-50 text-emerald-900"}
                />
              </section>
            ) : null}

            <section className="overflow-hidden rounded-[1.75rem] border border-black/5 bg-white shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
              <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-6 py-4">
                <div>
                  <h2 className="text-lg font-black text-slate-900">{titreType}</h2>
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
                    <thead>
                      <tr>
                        <th className="sticky left-0 top-0 z-20 bg-slate-800 px-4 py-3 font-bold text-white">Article</th>
                        {colonnesClients.map((client) => (
                          <th
                            key={client}
                            title={client}
                            className="sticky top-0 z-10 w-[4.5rem] min-w-[4.5rem] max-w-[4.5rem] whitespace-normal break-words border-b border-r border-t border-sky-300 bg-sky-100 px-1 py-2 text-center align-middle text-[11px] font-bold leading-tight text-sky-900"
                          >
                            {client}
                          </th>
                        ))}
                        <th className="sticky top-0 z-10 bg-indigo-600 px-4 py-3 text-right font-bold text-white">Total commande</th>
                        <th className="sticky top-0 z-10 bg-emerald-100 px-4 py-3 text-right font-bold text-emerald-900">Stock PF</th>
                        <th className="sticky top-0 z-10 bg-amber-100 px-4 py-3 text-right font-bold text-amber-900">Programme en cours</th>
                        <th className="sticky top-0 z-10 bg-teal-600 px-4 py-3 text-right font-bold text-white">
                          Stock apres commande
                          <span className="block text-[11px] font-medium text-teal-100">stock - total commande</span>
                        </th>
                        <th className="sticky top-0 z-10 bg-rose-600 px-4 py-3 text-right font-bold text-white">Reste a fabriquer</th>
                      </tr>
                    </thead>
                    <tbody>
                      {lignes.map((ligne, index) => {
                        const fond = index % 2 === 0 ? "bg-white" : "bg-slate-50";
                        return (
                          <tr key={ligne.cle} className="group">
                            <td className={`sticky left-0 z-[1] border-b border-r border-slate-300 px-4 py-3 font-semibold text-slate-900 ${fond} group-hover:bg-sky-50`}>
                              {ligne.nom}
                            </td>
                            {colonnesClients.map((client) => {
                              const quantite = ligne.parClient.get(client);
                              return (
                                <td
                                  key={client}
                                  className={`w-[4.5rem] min-w-[4.5rem] max-w-[4.5rem] border-b border-r border-slate-300 px-1 py-2 text-center align-middle ${fond} group-hover:bg-sky-50`}
                                >
                                  {quantite !== undefined ? (
                                    <span className="inline-block min-w-[2.25rem] rounded-lg bg-sky-100 px-1.5 py-0.5 text-center font-bold text-sky-900">
                                      {formater(quantite)}
                                    </span>
                                  ) : null}
                                </td>
                              );
                            })}
                            <td className="border-b border-slate-100 bg-indigo-50 px-4 py-3 text-right text-base font-black text-indigo-900">{formater(ligne.total)}</td>
                            <td
                              className={`border-b border-slate-100 px-4 py-3 text-right font-semibold ${
                                ligne.stock < 0 ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-800"
                              }`}
                            >
                              {formater(ligne.stock)}
                            </td>
                            <td className={`border-b border-slate-100 px-4 py-3 text-right font-semibold ${ligne.enCours > 0 ? "bg-amber-50 text-amber-800" : `${fond} text-slate-400`}`}>
                              {formater(ligne.enCours)}
                            </td>
                            <td
                              title={
                                ligne.apres < 0
                                  ? `Il manquera ${formater(-ligne.apres)} cartons pour livrer toutes les commandes (avec le programme en cours : ${formater(ligne.apres + Math.max(0, ligne.enCours))})`
                                  : `Il restera ${formater(ligne.apres)} cartons en stock apres toutes les commandes`
                              }
                              className={`border-b border-slate-100 px-4 py-3 text-right text-base font-black ${
                                ligne.apres < 0 ? "bg-red-100 text-red-700" : "bg-emerald-100 text-emerald-800"
                              }`}
                            >
                              {formater(ligne.apres)}
                            </td>
                            <td
                              className={`border-b border-slate-100 px-4 py-3 text-right text-base font-black ${
                                ligne.reste > 0 ? "bg-rose-100 text-rose-700" : "bg-emerald-50 text-emerald-700"
                              }`}
                            >
                              {formater(ligne.reste)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr className="font-black">
                        <td className="sticky bottom-0 left-0 z-10 bg-slate-800 px-4 py-3 text-white">Total</td>
                        {colonnesClients.map((client) => (
                          <td
                            key={client}
                            className="sticky bottom-0 w-[4.5rem] min-w-[4.5rem] max-w-[4.5rem] border-r border-sky-300 bg-sky-200 px-1 py-3 text-center text-sky-900"
                          >
                            {formater(clients.get(client) ?? 0)}
                          </td>
                        ))}
                        <td className="sticky bottom-0 bg-indigo-600 px-4 py-3 text-right text-white">{formater(totaux.total)}</td>
                        <td className="sticky bottom-0 bg-emerald-200 px-4 py-3 text-right text-emerald-900">{formater(totaux.stock)}</td>
                        <td className="sticky bottom-0 bg-amber-200 px-4 py-3 text-right text-amber-900">{formater(totaux.enCours)}</td>
                        <td className={`sticky bottom-0 px-4 py-3 text-right ${totaux.apres < 0 ? "bg-red-600 text-white" : "bg-teal-600 text-white"}`}>
                          {formater(totaux.apres)}
                        </td>
                        <td className="sticky bottom-0 bg-rose-600 px-4 py-3 text-right text-white">{formater(totaux.reste)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </section>
          </>
        ) : null}
      </div>
    </main>
  );
}
