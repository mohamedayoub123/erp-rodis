import { notFound } from "next/navigation";
import Link from "next/link";
import { unstable_noStore as noStore } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import { canWritePageUser, getCurrentStockUser, isAdminUser } from "@/lib/stock-auth";
import { BackButton } from "@/app/_components/back-button";
import { RefreshButton } from "@/app/_components/refresh-button";
import { LotStockCell } from "./lot-stock-cell";
import { DepotStockBatchForm } from "./stock-batch-form";
import { SyncStockButton } from "./sync-stock-button";
import { syncDepotStockToReserveAction } from "../actions";
import {
  ETAPE_PRODUCTION_LIBELLE,
  ajouterSource,
  fetchReservedByLotForDepot,
  type SourceReservation,
} from "./reservations";
import { SearchableFilterInput } from "@/app/_components/searchable-filter-input";
import { matchesArticleSearch } from "@/lib/article-search";
import { lireArticlesMpPourFormulaires } from "@/lib/articles-mp-liste";
import { lireArticlesPfListe } from "@/lib/articles-pf-liste";
import { lireStockDepot } from "./stock-depot";

type DepotRow = { id: number; nom: string };
function formatNumber(value: number) {
  return value.toLocaleString("fr-FR", { maximumFractionDigits: 3 });
}

// Petit bouton deroulant "Reserve ou ?" : liste des Transfer Orders / codes de production qui reservent cette ligne.
function ReserveDetails({ sources, ouvert }: { sources: SourceReservation[]; ouvert: boolean }) {
  if (sources.length === 0) {
    return <p className="mt-1 text-xs text-slate-400">Origine non retrouvee</p>;
  }
  return (
    <details className="mt-1" open={ouvert}>
      <summary className="cursor-pointer text-xs font-semibold text-sky-700">Reserve ou ? ({sources.length})</summary>
      <ul className="mt-1 space-y-1 text-xs text-slate-700">
        {sources.map((source) => (
          <li key={`${source.type}-${source.code}`}>
            <Link href={source.href} className="font-semibold text-sky-700 underline">
              {source.code}
            </Link>{" "}
            - {source.detail} : <span className="font-semibold">{formatNumber(source.quantite)}</span>
          </li>
        ))}
      </ul>
    </details>
  );
}

export default async function DepotDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ reserve?: string; article?: string }>;
}) {
  noStore();
  const { id } = await params;
  const parametres = await searchParams;
  // ?reserve=1 : n'afficher que les articles/lots reserves (le reste du stock reste compte pour l'alignement)
  const seulementReserves = parametres.reserve === "1";
  // ?article=... : n'afficher que cet article (voir plus bas)
  const articleFiltre = (parametres.article || "").trim();
  const depotId = Number(id);
  if (!depotId) {
    notFound();
  }

  const currentUser = await getCurrentStockUser();
  const canEdit = await canWritePageUser(currentUser, "depots");
  // "Mettre tout le stock = Reserve" remet a 0 tout ce qui n'est pas reserve : reserve aux admins.
  const peutAlignerSurReserve = canEdit && isAdminUser(currentUser);

  // Stock par lot de CE depot : calcule par la base (quelques centaines de lignes) au lieu de telecharger les
  // 90 000 mouvements a chaque ouverture / filtre. Articles : listes gardees en memoire (relues seulement si
  // un article est ajoute ou supprime). Reservations : lues en meme temps.
  const [{ data: depotData }, stockDepot, articlesPf, articlesMp, reservations] = await Promise.all([
    supabaseServer.from("depots").select("id, nom").eq("id", depotId).maybeSingle(),
    lireStockDepot(depotId),
    lireArticlesPfListe(),
    lireArticlesMpPourFormulaires(),
    fetchReservedByLotForDepot(depotId),
  ]);

  const depot = depotData as DepotRow | null;
  if (!depot) {
    notFound();
  }

  const articlePfById = new Map(articlesPf.map((a) => [a.id, a]));
  const articleMpById = new Map(articlesMp.map((a) => [a.id, a]));
  // Listes du formulaire "Corriger le stock" : seulement pour ceux qui peuvent modifier
  const versOptions = (articles: { id: number; nom_article: string }[]) =>
    articles
      .map((a) => ({ id: a.id, label: a.nom_article }))
      .sort((a, b) => a.label.localeCompare(b.label, "fr", { sensitivity: "base" }));
  const articlesPfOptions = canEdit ? versOptions(articlesPf) : [];
  const articlesMpOptions = canEdit ? versOptions(articlesMp) : [];

  const { soldePf: soldePfByLot, soldeMp: soldeMpByLot, vracStatusByLot } = stockDepot;

  // Deja reserve par un Transfer Order approuve (PF et MP), PAR NUMERO DE
  // LOT precis - a deduire du solde reel de ce meme lot pour afficher ce
  // qui reste vraiment libre, meme principe que la page Produit.
  const mpArticleIds = [...new Set(soldeMpByLot.map((row) => row.articleId))];
  const {
    pf: reservedPfByLotByArticle,
    mp: reservedMpTransferByLotByArticle,
    sourcesPf,
    sourcesMp,
  } = reservations;

  // En plus des Transfer Order, une MP peut aussi etre reservee par une
  // validation Salle de pesage/conditionnement (production_mp_reserve, avec
  // son propre numero_lot par article) - pas de reservation equivalente
  // pour le PF (le stock PF n'est jamais "reserve" par la production,
  // seulement consomme directement).
  const reservedMpProductionByArticleLot = new Map<string, number>();
  if (mpArticleIds.length > 0) {
    const { data: reserveData } = await supabaseServer
      .from("production_mp_reserve")
      .select("production_code_termine_id, article_mp_id, numero_lot, quantite")
      .eq("depot_id", depotId)
      .gt("quantite", 0);
    const reservesProduction = (reserveData ?? []) as {
      production_code_termine_id: number;
      article_mp_id: number;
      numero_lot: string | null;
      quantite: number;
    }[];
    for (const row of reservesProduction) {
      const key = `${row.article_mp_id}::${(row.numero_lot || "").trim()}`;
      reservedMpProductionByArticleLot.set(
        key,
        (reservedMpProductionByArticleLot.get(key) ?? 0) + Number(row.quantite ?? 0)
      );
    }

    // Quel code de production reserve ? (code + etape, produit de la ligne de programme) - seulement pour les
    // reservations encore a quantite positive.
    const reservesActives = reservesProduction.filter((row) => Number(row.quantite ?? 0) > 1e-9);
    if (reservesActives.length > 0) {
      const { data: termineData } = await supabaseServer
        .from("production_code_termine")
        .select("id, programme_ligne_id, code, stage")
        .in("id", [...new Set(reservesActives.map((row) => row.production_code_termine_id))]);
      const termines = (termineData ?? []) as {
        id: number;
        programme_ligne_id: number;
        code: string;
        stage: string;
      }[];
      const { data: ligneProgrammeData } = await supabaseServer
        .from("programme_lignes")
        .select("id, produit")
        .in("id", [...new Set(termines.map((t) => t.programme_ligne_id))]);
      const produitParLigneId = new Map(
        ((ligneProgrammeData ?? []) as { id: number; produit: string | null }[]).map((l) => [l.id, l.produit])
      );
      const termineParId = new Map(termines.map((t) => [t.id, t]));

      for (const row of reservesActives) {
        const termine = termineParId.get(row.production_code_termine_id);
        ajouterSource(sourcesMp, row.article_mp_id, (row.numero_lot || "").trim(), {
          type: "PRODUCTION",
          code: termine ? `Production ${termine.code}` : "Production",
          detail: termine
            ? `${produitParLigneId.get(termine.programme_ligne_id) || "produit non renseigne"} - ${
                ETAPE_PRODUCTION_LIBELLE[termine.stage] ?? termine.stage
              }`
            : "code non retrouve",
          href: "/production/suivi/dashboard",
          quantite: Number(row.quantite ?? 0),
        });
      }
    }
  }

  const stockPf = soldePfByLot
    .map((row) => {
      const article = articlePfById.get(row.articleId);
      const reserve = reservedPfByLotByArticle.get(row.articleId)?.get(row.numeroLot) ?? 0;
      return {
        id: `${row.articleId}::${row.numeroLot}`,
        articleId: row.articleId,
        nom: article?.nom_article ?? `#${row.articleId}`,
        numeroLot: row.numeroLot,
        nature: article?.nature ?? null,
        statut: vracStatusByLot.get(`${row.articleId}::${row.numeroLot}`) ?? "-",
        solde: row.solde,
        reserve,
        disponible: row.solde - reserve,
        sources: sourcesPf.get(row.articleId)?.get(row.numeroLot) ?? [],
      };
    })
    .filter((row) => Math.abs(row.solde) > 1e-6)
    .sort(
      (a, b) => a.nom.localeCompare(b.nom, "fr", { sensitivity: "base" }) || a.numeroLot.localeCompare(b.numeroLot)
    );
  const stockMp = soldeMpByLot
    .map((row) => {
      const article = articleMpById.get(row.articleId);
      const key = `${row.articleId}::${row.numeroLot}`;
      const reserve =
        (reservedMpTransferByLotByArticle.get(row.articleId)?.get(row.numeroLot) ?? 0) +
        (reservedMpProductionByArticleLot.get(key) ?? 0);
      return {
        id: key,
        articleId: row.articleId,
        nom: article?.nom_article ?? `#${row.articleId}`,
        numeroLot: row.numeroLot,
        unite: article?.unite ?? null,
        solde: row.solde,
        reserve,
        disponible: row.solde - reserve,
        sources: sourcesMp.get(row.articleId)?.get(row.numeroLot) ?? [],
      };
    })
    .filter((row) => Math.abs(row.solde) > 1e-6)
    .sort(
      (a, b) => a.nom.localeCompare(b.nom, "fr", { sensitivity: "base" }) || a.numeroLot.localeCompare(b.numeroLot)
    );

  // Filtre "articles reserves seulement" : n'agit que sur l'AFFICHAGE - le formulaire d'alignement du stock
  // ci-dessus garde toujours toutes les lignes (stockPf / stockMp complets).
  const nbReservesPf = stockPf.filter((row) => row.reserve > 1e-6).length;
  const nbReservesMp = stockMp.filter((row) => row.reserve > 1e-6).length;
  // Filtre article : si le texte est EXACTEMENT le nom d'un article (choisi dans la liste), seulement cet article ;
  // sinon recherche tolerante (tous les mots, sans tenir compte des accents / majuscules).
  const articleFiltreMinuscule = articleFiltre.toLowerCase();
  const nomExactTrouve =
    articleFiltre !== "" &&
    [...stockPf, ...stockMp].some((row) => row.nom.trim().toLowerCase() === articleFiltreMinuscule);
  const correspondAuFiltreArticle = (nom: string) =>
    articleFiltre === "" ||
    (nomExactTrouve ? nom.trim().toLowerCase() === articleFiltreMinuscule : matchesArticleSearch(nom, articleFiltre));
  const stockPfAffiche = stockPf.filter(
    (row) => (!seulementReserves || row.reserve > 1e-6) && correspondAuFiltreArticle(row.nom)
  );
  const stockMpAffiche = stockMp.filter(
    (row) => (!seulementReserves || row.reserve > 1e-6) && correspondAuFiltreArticle(row.nom)
  );
  const optionsArticles = [...new Set([...stockPf, ...stockMp].map((row) => row.nom))]
    .sort((a, b) => a.localeCompare(b, "fr", { sensitivity: "base" }))
    .map((label, index) => ({ id: index, label }));
  const hrefFiltres = (reserve: boolean, avecArticle = true) => {
    const query = new URLSearchParams();
    if (reserve) query.set("reserve", "1");
    if (avecArticle && articleFiltre) query.set("article", articleFiltre);
    const texte = query.toString();
    return `/depots/${depotId}${texte ? `?${texte}` : ""}`;
  };

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#edf8ff_0%,#f8fcff_48%,#ffffff_100%)] px-4 py-6 text-slate-900 lg:px-8">
      <div className="mx-auto w-full space-y-6">
        <section className="rounded-[1.75rem] border border-black/5 bg-white p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.16em] text-sky-700">
                Entrepot
              </p>
              <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-900">{depot.nom}</h1>
              <p className="mt-2 text-sm text-slate-600">
                Stock reel actuellement dans ce depot. Le champ Depot d&apos;un article (
                <Link href="/articles/produit-fini" className="text-sky-700 underline">
                  Articles Produit Fini
                </Link>{" "}
                /{" "}
                <Link href="/articles/matiere-premiere" className="text-sky-700 underline">
                  Articles Matiere Premiere
                </Link>
                ) n&apos;est que le depot par defaut de son stock non encore transfere - utilise{" "}
                <Link href="/depots/transfer-order" className="text-sky-700 underline">
                  Transfer Order
                </Link>{" "}
                pour deplacer du stock d&apos;un depot vers un autre.
              </p>
            </div>

            <div className="flex items-center gap-3">
              <BackButton href="/depots" label="Retour" />
              <RefreshButton />
            </div>
          </div>
        </section>

        {peutAlignerSurReserve ? (
          <section className="rounded-[1.75rem] border border-amber-200 bg-amber-50/60 p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
            <p className="text-sm font-semibold text-amber-900">
              Aligner automatiquement tout le stock de ce depot sur ce qui est deja reserve
            </p>
            <p className="mt-1 text-xs text-amber-800">
              Chaque article/lot du depot est mis a jour pour que son Stock devienne exactement
              egal a son Reserve actuel (visible dans les tableaux ci-dessous) - ce qui n&apos;est
              pas du tout reserve tombe a 0.
            </p>
            <form action={syncDepotStockToReserveAction} className="mt-4">
              <input type="hidden" name="depot_id" value={depotId} />
              {stockPf.map((row) => (
                <span key={`pf-${row.id}`}>
                  <input type="hidden" name="article_type" value="PF" />
                  <input type="hidden" name="article_id" value={row.articleId} />
                  <input type="hidden" name="numero_lot" value={row.numeroLot} />
                  <input type="hidden" name="solde" value={row.solde} />
                  <input type="hidden" name="reserve" value={row.reserve} />
                </span>
              ))}
              {stockMp.map((row) => (
                <span key={`mp-${row.id}`}>
                  <input type="hidden" name="article_type" value="MP" />
                  <input type="hidden" name="article_id" value={row.articleId} />
                  <input type="hidden" name="numero_lot" value={row.numeroLot} />
                  <input type="hidden" name="solde" value={row.solde} />
                  <input type="hidden" name="reserve" value={row.reserve} />
                </span>
              ))}
              <SyncStockButton />
            </form>
          </section>
        ) : null}

        {canEdit ? (
          <details className="group overflow-hidden rounded-[1.75rem] border border-black/5 bg-white shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
            <summary className="cursor-pointer list-none px-5 py-4 text-sm font-semibold text-sky-700 marker:content-none">
              + Corriger le stock (plusieurs articles/lots d&apos;un coup)
            </summary>
            <DepotStockBatchForm depotId={depotId} articlesMp={articlesMpOptions} articlesPf={articlesPfOptions} />
          </details>
        ) : null}

        <section className="space-y-3 rounded-[1.75rem] border border-black/5 bg-white p-4 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
          <form className="grid gap-3 sm:grid-cols-[1fr_auto_auto]">
            {seulementReserves ? <input type="hidden" name="reserve" value="1" /> : null}
            <SearchableFilterInput
              name="article"
              defaultValue={articleFiltre}
              options={optionsArticles}
              placeholder="Filtrer par article..."
            />
            <button
              type="submit"
              className="rounded-2xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
            >
              Filtrer
            </button>
            {articleFiltre ? (
              <Link
                href={hrefFiltres(seulementReserves, false)}
                className="rounded-2xl border border-slate-200 px-5 py-3 text-center text-sm font-semibold text-slate-700"
              >
                Effacer
              </Link>
            ) : null}
          </form>

          <div className="flex flex-wrap items-center gap-3">
            <p className="text-sm font-semibold text-slate-700">Afficher :</p>
            <Link
              href={hrefFiltres(false)}
              className={`rounded-full px-4 py-2 text-sm font-semibold ${
                seulementReserves ? "border border-slate-200 text-slate-700" : "bg-slate-950 text-white"
              }`}
            >
              Tout le stock
            </Link>
            <Link
              href={hrefFiltres(true)}
              className={`rounded-full px-4 py-2 text-sm font-semibold ${
                seulementReserves ? "bg-amber-600 text-white" : "border border-amber-200 bg-amber-50 text-amber-800"
              }`}
            >
              Seulement les articles reserves ({nbReservesPf + nbReservesMp})
            </Link>
            <p className="text-xs text-slate-500">
              Clique sur &laquo; Reserve ou ? &raquo; dans la colonne Reserve pour voir quel Transfer Order ou quel
              code de production reserve la ligne.
            </p>
          </div>
        </section>

        <section className="overflow-hidden rounded-[1.75rem] border border-black/5 bg-white shadow-[0_18px_50px_rgba(15,23,42,0.08)]">
          <h2 className="border-b border-slate-100 px-6 py-4 text-sm font-bold uppercase tracking-wide text-slate-500">
            Produit fini
          </h2>
          {stockPf.length === 0 ? (
            <p className="px-6 py-6 text-sm text-slate-500">Aucun stock produit fini dans ce depot.</p>
          ) : stockPfAffiche.length === 0 ? (
            <p className="px-6 py-6 text-sm text-slate-500">
              {articleFiltre || seulementReserves
                ? "Aucun article produit fini ne correspond a ce filtre dans ce depot."
                : "Aucun article produit fini dans ce depot."}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-slate-50 text-slate-500">
                  <tr>
                    <th className="px-6 py-4 font-semibold">Article</th>
                    <th className="px-6 py-4 font-semibold">Numero de lot</th>
                    <th className="px-6 py-4 font-semibold">Nature</th>
                    <th className="px-6 py-4 font-semibold">Statut</th>
                    <th className="px-6 py-4 font-semibold">Stock</th>
                    <th className="px-6 py-4 font-semibold">Reserve</th>
                    <th className="px-6 py-4 font-semibold">Disponible</th>
                  </tr>
                </thead>
                <tbody>
                  {stockPfAffiche.map((row) => (
                    <tr key={row.id} className="border-t border-slate-100">
                      <td className="px-6 py-4 font-medium text-slate-900">{row.nom}</td>
                      <td className="px-6 py-4 text-slate-600">{row.numeroLot || "-"}</td>
                      <td className="px-6 py-4 text-slate-600">{row.nature === "vrac" ? "Vrac" : "Fini"}</td>
                      <td className="px-6 py-4">
                        {row.statut === "A recuperer" ? (
                          <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-800">
                            A recuperer
                          </span>
                        ) : row.statut === "Conforme" ? (
                          <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
                            Conforme
                          </span>
                        ) : (
                          <span className="text-slate-400">-</span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-slate-600">
                        <LotStockCell
                          depotId={depotId}
                          articleType="PF"
                          articleId={row.articleId}
                          numeroLot={row.numeroLot}
                          solde={row.solde}
                          reserve={row.reserve}
                          canEdit={canEdit}
                        />
                      </td>
                      <td className="px-6 py-4 text-slate-600">
                        {row.reserve > 1e-6 ? (
                          <div>
                            <span className="font-semibold text-amber-800">{formatNumber(row.reserve)}</span>
                            <ReserveDetails sources={row.sources} ouvert={seulementReserves} />
                          </div>
                        ) : (
                          "-"
                        )}
                      </td>
                      <td className="px-6 py-4 text-slate-600">{formatNumber(row.disponible)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="overflow-hidden rounded-[1.75rem] border border-black/5 bg-white shadow-[0_18px_50px_rgba(15,23,42,0.08)]">
          <h2 className="border-b border-slate-100 px-6 py-4 text-sm font-bold uppercase tracking-wide text-slate-500">
            Matiere premiere
          </h2>
          {stockMp.length === 0 ? (
            <p className="px-6 py-6 text-sm text-slate-500">Aucun stock matiere premiere dans ce depot.</p>
          ) : stockMpAffiche.length === 0 ? (
            <p className="px-6 py-6 text-sm text-slate-500">
              {articleFiltre || seulementReserves
                ? "Aucune matiere premiere ne correspond a ce filtre dans ce depot."
                : "Aucune matiere premiere dans ce depot."}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-slate-50 text-slate-500">
                  <tr>
                    <th className="px-6 py-4 font-semibold">Article</th>
                    <th className="px-6 py-4 font-semibold">Numero de lot</th>
                    <th className="px-6 py-4 font-semibold">Unite</th>
                    <th className="px-6 py-4 font-semibold">Stock</th>
                    <th className="px-6 py-4 font-semibold">Reserve</th>
                    <th className="px-6 py-4 font-semibold">Disponible</th>
                  </tr>
                </thead>
                <tbody>
                  {stockMpAffiche.map((row) => (
                    <tr key={row.id} className="border-t border-slate-100">
                      <td className="px-6 py-4 font-medium text-slate-900">{row.nom}</td>
                      <td className="px-6 py-4 text-slate-600">{row.numeroLot || "-"}</td>
                      <td className="px-6 py-4 text-slate-600">{row.unite || "-"}</td>
                      <td className="px-6 py-4 text-slate-600">
                        <LotStockCell
                          depotId={depotId}
                          articleType="MP"
                          articleId={row.articleId}
                          numeroLot={row.numeroLot}
                          solde={row.solde}
                          reserve={row.reserve}
                          canEdit={canEdit}
                        />
                      </td>
                      <td className="px-6 py-4 text-slate-600">
                        {row.reserve > 1e-6 ? (
                          <div>
                            <span className="font-semibold text-amber-800">{formatNumber(row.reserve)}</span>
                            <ReserveDetails sources={row.sources} ouvert={seulementReserves} />
                          </div>
                        ) : (
                          "-"
                        )}
                      </td>
                      <td className="px-6 py-4 text-slate-600">{formatNumber(row.disponible)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
