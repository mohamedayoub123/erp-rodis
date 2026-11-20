import { unstable_noStore as noStore } from "next/cache";
import { BackButton } from "@/app/_components/back-button";
import { RefreshButton } from "@/app/_components/refresh-button";
import { SearchableFilterInput } from "@/app/_components/searchable-filter-input";
import { VoirToutBanner } from "@/app/_components/voir-tout-banner";
import { matchesArticleSearch } from "@/lib/article-search";
import { formatDate } from "@/lib/format-date";
import {
  fetchLivraisonsClient,
  fetchNomsClients,
  grouperParCode,
  livraisonDansLesMois,
} from "@/lib/livraisons-client-codes";
import { canViewPageUser, getCurrentStockUser } from "@/lib/stock-auth";

type SearchParams = Promise<{ client?: string; du?: string; au?: string; article?: string; tout?: string }>;

// Les premieres lignes par defaut, "Voir tout" affiche le reste (voir app/_components/voir-tout-banner.tsx) : un gros client a plusieurs
// centaines de codes. Les totaux portent toujours sur tout.
const LIMITE_LIGNES = 150;
const MOIS_ISO = /^\d{4}-\d{2}$/;

function nombre(valeur: number) {
  return valeur.toLocaleString("fr-FR", { maximumFractionDigits: 2 });
}

export default async function LivraisonClientPfPage({ searchParams }: { searchParams: SearchParams }) {
  noStore();
  const params = await searchParams;
  const currentUser = await getCurrentStockUser();

  // Controle cote serveur AVANT de lire les donnees (la barriere d'acces de la mise en page ne doit pas etre la seule protection)
  if (!(await canViewPageUser(currentUser, "stockLivraisonClientPf"))) {
    return (
      <main className="px-6 py-10 lg:px-10">
        <section className="mx-auto max-w-3xl rounded-[2rem] border border-red-200 bg-white p-8 text-center">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-red-700">Acces non autorise</p>
          <h1 className="mt-3 text-2xl font-black tracking-tight text-slate-950">
            Cette page n&apos;est pas ouverte pour {currentUser ?? "ce compte"}
          </h1>
        </section>
      </main>
    );
  }

  const client = (params.client || "").trim();
  const moisDebut = MOIS_ISO.test(params.du || "") ? (params.du as string) : "";
  const moisFin = MOIS_ISO.test(params.au || "") ? (params.au as string) : "";
  const articleFiltre = (params.article || "").trim();
  const toutAffiche = params.tout === "1";
  const hasFilters = Boolean(client || moisDebut || moisFin || articleFiltre);

  const [nomsClients, livraisons] = await Promise.all([
    fetchNomsClients(),
    client ? fetchLivraisonsClient(client) : Promise.resolve({ lignes: [], error: null as string | null }),
  ]);
  const clientOptions = nomsClients.map((label, id) => ({ id, label }));

  // Les articles proposes sont tous ceux livres a ce client (avant le filtre mois / article, pour que la liste ne change pas en filtrant)
  const articleOptions = [...new Set(livraisons.lignes.map((ligne) => ligne.article))]
    .sort((a, b) => a.localeCompare(b, "fr", { sensitivity: "base" }))
    .map((label, id) => ({ id, label }));
  const nomsTrouves = [...new Map(livraisons.lignes.map((ligne) => [ligne.client.trim().toLowerCase(), ligne.client.trim()])).values()].sort(
    (a, b) => a.localeCompare(b, "fr", { sensitivity: "base" })
  );

  const lignesFiltrees = livraisons.lignes
    .filter((ligne) => livraisonDansLesMois(ligne, moisDebut, moisFin))
    .filter((ligne) => !articleFiltre || matchesArticleSearch(ligne.article, articleFiltre));
  const codes = grouperParCode(lignesFiltrees);
  const codesAffiches = toutAffiche ? codes : codes.slice(0, LIMITE_LIGNES);
  const quantiteTotale = codes.reduce((somme, ligne) => somme + ligne.quantite, 0);
  const nbArticles = new Set(codes.map((ligne) => ligne.articleId)).size;
  const afficherClient = nomsTrouves.length > 1;

  const hrefVoirTout = `/stock/rapport/livraison-client?${new URLSearchParams({
    client,
    ...(moisDebut ? { du: moisDebut } : {}),
    ...(moisFin ? { au: moisFin } : {}),
    ...(articleFiltre ? { article: articleFiltre } : {}),
    tout: "1",
  }).toString()}`;

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#eef5f0_0%,#f8fbf8_50%,#ffffff_100%)] px-4 py-6 text-slate-900 lg:px-8">
      <div className="mx-auto w-full space-y-6">
        <div className="flex flex-col gap-4 rounded-[2rem] border border-black/5 bg-white/85 p-6 shadow-[0_18px_50px_rgba(15,23,42,0.08)] backdrop-blur sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-emerald-700">ERP Rodis</p>
            <h1 className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">Livraison par client</h1>
            <p className="mt-2 text-sm leading-6 text-slate-600 sm:text-base">
              Ecris un client : tous les codes (lots) livres pour lui, avec l&apos;article, la quantite et les dates de livraison. Filtre par mois
              et par article.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <BackButton href="/stock/rapport" label="Retour rapport" />
            <RefreshButton />
          </div>
        </div>

        <section className="rounded-[2rem] border border-black/5 bg-white p-6 shadow-[0_18px_50px_rgba(15,23,42,0.08)]">
          <form className="grid gap-3 sm:grid-cols-2 xl:grid-cols-[2fr_1fr_1fr_2fr_auto]">
            <SearchableFilterInput name="client" defaultValue={client} options={clientOptions} placeholder="Client..." />
            <label className="flex flex-col gap-1 text-xs font-semibold text-slate-500">
              Du mois
              <input
                type="month"
                name="du"
                defaultValue={moisDebut}
                className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-normal text-slate-900 outline-none"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs font-semibold text-slate-500">
              Au mois
              <input
                type="month"
                name="au"
                defaultValue={moisFin}
                className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-normal text-slate-900 outline-none"
              />
            </label>
            <SearchableFilterInput name="article" defaultValue={articleFiltre} options={articleOptions} placeholder="Article..." />
            <div className="flex gap-3">
              <button
                type="submit"
                className="rounded-2xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
              >
                Filtrer
              </button>
              {hasFilters ? (
                <a
                  href="/stock/rapport/livraison-client"
                  className="rounded-2xl border border-slate-200 px-5 py-3 text-center text-sm font-semibold text-slate-700"
                >
                  Effacer
                </a>
              ) : null}
            </div>
          </form>
        </section>

        {client ? (
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="rounded-[2rem] border border-black/5 bg-emerald-700 p-6 text-white shadow-[0_18px_50px_rgba(15,23,42,0.12)]">
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-emerald-100">Quantite livree</p>
              <p className="mt-2 text-4xl font-black tracking-tight">{nombre(quantiteTotale)}</p>
            </div>
            <div className="rounded-[2rem] border border-black/5 bg-white p-6 shadow-[0_18px_50px_rgba(15,23,42,0.08)]">
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">Codes livres</p>
              <p className="mt-2 text-4xl font-black tracking-tight text-slate-900">{nombre(codes.length)}</p>
            </div>
            <div className="rounded-[2rem] border border-black/5 bg-white p-6 shadow-[0_18px_50px_rgba(15,23,42,0.08)]">
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">Articles</p>
              <p className="mt-2 text-4xl font-black tracking-tight text-slate-900">{nombre(nbArticles)}</p>
            </div>
          </div>
        ) : null}

        {client && nomsTrouves.length > 1 ? (
          <p className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            Plusieurs noms contiennent &laquo;&nbsp;{client}&nbsp;&raquo; : {nomsTrouves.join(", ")}. Ecris le nom complet pour n&apos;avoir que celui-la.
          </p>
        ) : null}

        <section className="overflow-hidden rounded-[2rem] border border-black/5 bg-white shadow-[0_18px_50px_rgba(15,23,42,0.08)]">
          {livraisons.error ? (
            <div className="px-6 py-8">
              <p className="rounded-2xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">{livraisons.error}</p>
            </div>
          ) : !client ? (
            <div className="px-6 py-8 text-sm text-slate-500">Choisis un client pour voir les codes qui lui ont ete livres.</div>
          ) : codes.length === 0 ? (
            <div className="px-6 py-8 text-sm text-slate-500">
              {livraisons.lignes.length === 0
                ? "Aucune livraison trouvee pour ce client."
                : "Aucune livraison pour ces filtres (mois / article)."}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-slate-50 text-slate-500">
                  <tr>
                    <th className="px-6 py-4 font-semibold">Article</th>
                    <th className="px-6 py-4 font-semibold">Code</th>
                    <th className="px-6 py-4 font-semibold">Quantite livree</th>
                    <th className="px-6 py-4 font-semibold">Date fabrication</th>
                    <th className="px-6 py-4 font-semibold">Date(s) de livraison</th>
                    {afficherClient ? <th className="px-6 py-4 font-semibold">Client</th> : null}
                  </tr>
                </thead>
                <tbody>
                  {codesAffiches.map((ligne) => (
                    <tr key={ligne.cle} className="border-t border-slate-100 align-top">
                      <td className="px-6 py-4 font-medium text-slate-900">{ligne.article}</td>
                      <td className="px-6 py-4 text-slate-600">{ligne.code}</td>
                      <td className="px-6 py-4">
                        <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-800">
                          {nombre(ligne.quantite)}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-slate-600">{formatDate(ligne.dateFabrication)}</td>
                      <td className="px-6 py-4 text-slate-600">
                        {ligne.dates.length > 0 ? ligne.dates.map((date) => formatDate(date)).join(", ") : "-"}
                      </td>
                      {afficherClient ? <td className="px-6 py-4 text-slate-600">{ligne.clients.join(", ")}</td> : null}
                    </tr>
                  ))}
                </tbody>
              </table>
              <VoirToutBanner affiches={codesAffiches.length} total={codes.length} href={hrefVoirTout} />
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
