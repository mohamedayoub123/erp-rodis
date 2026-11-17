import Link from "next/link";
import { unstable_noStore as noStore } from "next/cache";
import { BackButton } from "@/app/_components/back-button";
import { RefreshButton } from "@/app/_components/refresh-button";
import { supabaseServer } from "@/lib/supabase-server";
import { calculerCartonsAProduireGlobal } from "@/lib/composants-conditionnement";
import { pdsDesArticles } from "@/lib/programme-en-cours-par-pd";
import { LienParType } from "../lien-par-type";
import { TableauStockRestant, type LigneStockRestant } from "./tableau-stock-restant";

// STOCK RESTANT par TYPE de produit fini (champ "Type" de la fiche article : hydratant, clarifiant, gel douche, pommade...) : on choisit le type, la page
// donne tous les articles de ce type qui sont commandes avec DEUX colonnes seulement - le Stock (stock PF) et le Stock restant = ce qui restera en stock
// apres les commandes ET apres les programmes en cours (stock + programme en cours - commande, negatif = il manquera). Meme calcul et memes articles que la
// page Commandes par type (lib/composants-conditionnement.ts) : toutes les commandes non livrees (En cours, Stand, BL transforme), stock PF comme la page
// Stock (les articles du meme nom partagent leur stock), programme en cours = emballe pas encore en stock + reste a conditionner / emballer (cartons entiers).
// Le filtre "Programme en cours : PD" (app/tableau-commandes/filtre-pd.tsx) choisit les PD dont le programme en cours compte : seuls les PD qui
// contiennent des articles du type choisi sont proposes (lib/programme-en-cours-par-pd.ts).

type SearchParams = Promise<{ type?: string }>;

type ArticleLu = { id: number; nom_article: string | null; nature: string | null; type_article: string | null };

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

async function lireArticles(): Promise<{ rows: ArticleLu[]; error: string | null }> {
  const rows: ArticleLu[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabaseServer
      .from("articles")
      .select("id, nom_article, nature, type_article")
      .order("id", { ascending: true })
      .range(from, from + 999);
    if (error) return { rows, error: error.message };
    const page = (data ?? []) as ArticleLu[];
    rows.push(...page);
    if (page.length < 1000) break;
  }
  return { rows, error: null };
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

function arrondi2(valeur: number): number {
  return Math.round(valeur * 100) / 100;
}

type DetailArticle = { cle: string; nom: string; commande: number };

export default async function StockRestantParTypePage({ searchParams }: { searchParams: SearchParams }) {
  noStore();
  const params = await searchParams;
  const typeChoisi = String(params.type || "").trim();

  const { rows: articlesTous, error: articlesErreur } = await lireArticles();
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
      { articleIds: idsDuType, parPd: true }
    );
  } catch (e) {
    calculErreur = e instanceof Error ? e.message : "Calcul impossible.";
  }
  const erreur = articlesErreur || calculErreur;

  // Resume par type : articles commandes et cartons commandes (toutes les commandes non livrees)
  const resumeParType = new Map<string, { articles: Set<number>; cartons: number }>();
  // Detail du type choisi, une ligne par NOM d'article (les articles du meme nom partagent stock et programmes)
  const detailParCle = new Map<string, DetailArticle>();
  for (const ligne of calcul?.lignes ?? []) {
    const article = ligne.article_id ? articleParId.get(ligne.article_id) : undefined;
    const cartons = Number(ligne.quantite_demandee ?? 0);
    if (!article || !(cartons > 0)) continue;
    const type = cleType(article.type_article);

    const resume = resumeParType.get(type) ?? { articles: new Set<number>(), cartons: 0 };
    resume.articles.add(article.id);
    resume.cartons += cartons;
    resumeParType.set(type, resume);

    if (!idsDuType.has(article.id)) continue;
    const cle = calcul?.cleParId.get(article.id) ?? String(article.id);
    const detail = detailParCle.get(cle) ?? { cle, nom: article.nom_article ?? `Article #${article.id}`, commande: 0 };
    detail.commande += cartons;
    detailParCle.set(cle, detail);
  }

  const types = [...resumeParType.entries()].sort((a, b) => b[1].cartons - a[1].cartons);
  const lignes: LigneStockRestant[] = [...detailParCle.values()]
    .map((detail) => {
      const stock = calcul?.stockPfParNom.get(detail.cle) ?? 0;
      // Programme en cours en cartons ENTIERS (comme Commandes par type)
      const enCours = Math.round(calcul?.qtEnCoursParNom.get(detail.cle) ?? 0);
      const commande = arrondi2(detail.commande);
      return {
        cle: detail.cle,
        nom: detail.nom,
        stock,
        enCours,
        // le meme programme en cours, reparti entre les PD (filtre "Programme en cours : PD")
        enCoursParPd: calcul?.enCoursParPd.get(detail.cle) ?? {},
        commande,
        apres: arrondi2(stock + enCours - commande),
      };
    })
    .filter((ligne) => ligne.commande > 0)
    .sort((a, b) => a.nom.localeCompare(b.nom, "fr", { sensitivity: "base", numeric: true }));
  // Les PD proposes dans le filtre : ceux qui contiennent des articles du type choisi (commandes ou non) avec du programme en cours
  const pdsDuType = pdsDesArticles(
    [...idsDuType].map((id) => calcul?.cleParId.get(id) ?? ""),
    calcul?.enCoursParPd ?? new Map()
  );
  const titreType = typeChoisi === TOUS ? "Tous les types" : libelleType(typeChoisi, exemplesDeType);
  const dateDuJour = new Date().toISOString().slice(0, 10);

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#f4efe5_0%,#fbf8f2_45%,#ffffff_100%)] px-4 py-6 text-slate-900 lg:px-8">
      <div className="mx-auto w-full space-y-6">
        <section className="rounded-[1.75rem] border border-black/5 bg-white p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.16em] text-blue-700">Gestion Stock PF</p>
              <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-900">Stock restant par type de produit fini</h1>
              <p className="mt-2 max-w-3xl text-sm text-slate-600">
                Choisis un type : tous les articles de ce type qui sont commandes (commandes non livrees : en cours, stand, BL transforme), avec seulement le
                stock et le stock restant apres les commandes ET apres les programmes en cours (stock + programme en cours - commande). Meme calcul que
                Commandes par type. Le filtre &quot;Programme en cours&quot; permet de choisir les PD dont le programme en cours compte (seulement les PD
                qui contiennent des articles du type choisi).
              </p>
            </div>
            <div className="flex items-center gap-3">
              <LienParType />
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
                  href={`/tableau-commandes/stock-restant?type=${encodeURIComponent(cle)}`}
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
              href={`/tableau-commandes/stock-restant?type=${TOUS}`}
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
          <TableauStockRestant
            key={typeChoisi}
            titre={titreType}
            lignes={lignes}
            pds={pdsDuType}
            nomFichier={`stock-restant-par-type-${typeChoisi === TOUS ? "tous" : typeChoisi.replace(/[^a-z0-9]+/gi, "-")}-${dateDuJour}.xlsx`}
          />
        ) : null}
      </div>
    </main>
  );
}
