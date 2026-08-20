import { notFound } from "next/navigation";
import Link from "next/link";
import { unstable_noStore as noStore } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import { canWritePageUser, getCurrentStockUser } from "@/lib/stock-auth";
import { BackButton } from "@/app/_components/back-button";
import { RefreshButton } from "@/app/_components/refresh-button";
import { LotStockCell } from "./lot-stock-cell";

type DepotRow = { id: number; nom: string };
type ArticlePfRow = { id: number; nom_article: string; nature: string | null; depot_id: number | null };
type ArticleMpRow = { id: number; nom_article: string; unite: string | null; depot_id: number | null };
type LotRow = {
  article_id: number | null;
  numero_lot: string | null;
  qte_entree: number;
  qte_sortie: number;
  depot_id: number | null;
  note: string | null;
};

async function fetchAll<T>(table: string, select: string) {
  const rows: T[] = [];
  let from = 0;
  const pageSize = 1000;

  while (true) {
    const { data, error } = await supabaseServer.from(table).select(select).range(from, from + pageSize - 1);
    if (error) return { rows, error };
    rows.push(...((data ?? []) as T[]));
    if ((data ?? []).length < pageSize) break;
    from += pageSize;
  }

  return { rows, error: null };
}

function formatNumber(value: number) {
  return value.toLocaleString("fr-FR", { maximumFractionDigits: 3 });
}

type LotBalance = { articleId: number; numeroLot: string; solde: number };

// Solde par article ET par numero de lot DANS CE DEPOT precis - un lot dont
// depot_id est encore vide (jamais transfere) est considere dans le depot
// par DEFAUT de son article (voir articles.depot_id) - un article MP par
// defaut "Depot E" peut donc quand meme avoir du stock affiche ici sur un
// AUTRE depot, une fois qu'un Transfer Order/Transfer Invoice valide l'a
// deplace.
function computeSoldeByArticleLot(
  lots: LotRow[],
  depotIdByArticleId: Map<number, number | null>,
  depotId: number
): LotBalance[] {
  const map = new Map<string, LotBalance>();
  for (const lot of lots) {
    if (!lot.article_id) continue;
    const effectiveDepotId = lot.depot_id ?? depotIdByArticleId.get(lot.article_id) ?? null;
    if (effectiveDepotId !== depotId) continue;
    const numeroLot = (lot.numero_lot || "").trim();
    const key = `${lot.article_id}::${numeroLot}`;
    const existing = map.get(key);
    const delta = Number(lot.qte_entree ?? 0) - Number(lot.qte_sortie ?? 0);
    if (existing) {
      existing.solde += delta;
    } else {
      map.set(key, { articleId: lot.article_id, numeroLot, solde: delta });
    }
  }
  return [...map.values()];
}

// Statut qualite d'un lot de vrac (Conforme / A recuperer), derive de la
// note posee au credit par crediterVracFabrique (voir app/production/
// suivi-production/actions.ts) - "A detruire" ne credite JAMAIS le stock
// (production_destruction_history a la place), donc un lot detruit
// n'apparait structurellement jamais ici et ne peut pas etre choisi dans
// le picker "Code vrac recupere" de la Fabrication.
function deriveVracStatusByLot(lots: LotRow[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const lot of lots) {
    if (!lot.article_id || !lot.note?.startsWith("Fabrication vrac")) continue;
    const key = `${lot.article_id}::${(lot.numero_lot || "").trim()}`;
    map.set(key, lot.note.includes("A recuperer") ? "A recuperer" : "Conforme");
  }
  return map;
}

// Reservation Transfer Order deja promise sur ce depot, par article puis
// par numero de lot - remplace un fetchReservedByLot appele UNE FOIS PAR
// ARTICLE distinct du depot (3 requetes chacun, page tres lente des que le
// depot a beaucoup d'articles) par une seule serie de requetes partant du
// DEPOT (transfer_orders de ce depot -> leurs lignes -> leurs lots), quel
// que soit le nombre d'articles concernes.
async function fetchReservedByLotForDepot(
  depotId: number
): Promise<{ pf: Map<number, Map<string, number>>; mp: Map<number, Map<string, number>> }> {
  const pf = new Map<number, Map<string, number>>();
  const mp = new Map<number, Map<string, number>>();

  const { data: transferOrdersData } = await supabaseServer
    .from("transfer_orders")
    .select("id")
    .eq("depot_source_id", depotId);
  const transferOrderIds = ((transferOrdersData ?? []) as { id: number }[]).map((t) => t.id);
  if (transferOrderIds.length === 0) return { pf, mp };

  const { data: lignesData } = await supabaseServer
    .from("transfer_order_lignes")
    .select("id, article_type, article_id")
    .in("transfer_order_id", transferOrderIds);
  const lignes = (lignesData ?? []) as { id: number; article_type: string; article_id: number }[];
  if (lignes.length === 0) return { pf, mp };

  const ligneById = new Map(lignes.map((l) => [l.id, l]));
  const { data: ligneLotsData } = await supabaseServer
    .from("transfer_order_ligne_lots")
    .select("transfer_order_ligne_id, numero_lot, quantite")
    .in(
      "transfer_order_ligne_id",
      lignes.map((l) => l.id)
    );

  for (const row of (ligneLotsData ?? []) as {
    transfer_order_ligne_id: number;
    numero_lot: string | null;
    quantite: number;
  }[]) {
    const ligne = ligneById.get(row.transfer_order_ligne_id);
    if (!ligne) continue;
    const target = ligne.article_type === "MP" ? mp : pf;
    const byLot = target.get(ligne.article_id) ?? new Map<string, number>();
    const key = row.numero_lot || "";
    byLot.set(key, (byLot.get(key) ?? 0) + Number(row.quantite ?? 0));
    target.set(ligne.article_id, byLot);
  }

  return { pf, mp };
}

export default async function DepotDetailPage({ params }: { params: Promise<{ id: string }> }) {
  noStore();
  const { id } = await params;
  const depotId = Number(id);
  if (!depotId) {
    notFound();
  }

  const currentUser = await getCurrentStockUser();
  const canEdit = await canWritePageUser(currentUser, "depots");

  const [
    { data: depotData },
    { rows: articlesPf },
    { rows: articlesMp },
    { rows: lotsPf },
    { rows: lotsMp },
  ] = await Promise.all([
    supabaseServer.from("depots").select("id, nom").eq("id", depotId).maybeSingle(),
    fetchAll<ArticlePfRow>("articles", "id, nom_article, nature, depot_id"),
    fetchAll<ArticleMpRow>("articles_matiere_premiere", "id, nom_article, unite, depot_id"),
    fetchAll<LotRow>("lots_stock", "article_id, numero_lot, qte_entree, qte_sortie, depot_id, note"),
    fetchAll<LotRow>("lots_stock_matiere_premiere", "article_id, numero_lot, qte_entree, qte_sortie, depot_id, note"),
  ]);

  const depot = depotData as DepotRow | null;
  if (!depot) {
    notFound();
  }

  const articlePfById = new Map(articlesPf.map((a) => [a.id, a]));
  const articleMpById = new Map(articlesMp.map((a) => [a.id, a]));
  const depotIdByArticlePfId = new Map(articlesPf.map((a) => [a.id, a.depot_id]));
  const depotIdByArticleMpId = new Map(articlesMp.map((a) => [a.id, a.depot_id]));

  const soldePfByLot = computeSoldeByArticleLot(lotsPf, depotIdByArticlePfId, depotId);
  const soldeMpByLot = computeSoldeByArticleLot(lotsMp, depotIdByArticleMpId, depotId);
  const vracStatusByLot = deriveVracStatusByLot(lotsPf);

  // Deja reserve par un Transfer Order approuve (PF et MP), PAR NUMERO DE
  // LOT precis - a deduire du solde reel de ce meme lot pour afficher ce
  // qui reste vraiment libre, meme principe que la page Produit.
  const mpArticleIds = [...new Set(soldeMpByLot.map((row) => row.articleId))];
  const { pf: reservedPfByLotByArticle, mp: reservedMpTransferByLotByArticle } =
    await fetchReservedByLotForDepot(depotId);

  // En plus des Transfer Order, une MP peut aussi etre reservee par une
  // validation Salle de pesage/conditionnement (production_mp_reserve, avec
  // son propre numero_lot par article) - pas de reservation equivalente
  // pour le PF (le stock PF n'est jamais "reserve" par la production,
  // seulement consomme directement).
  const reservedMpProductionByArticleLot = new Map<string, number>();
  if (mpArticleIds.length > 0) {
    const { data: reserveData } = await supabaseServer
      .from("production_mp_reserve")
      .select("article_mp_id, numero_lot, quantite")
      .eq("depot_id", depotId)
      .in("article_mp_id", mpArticleIds);
    for (const row of (reserveData as { article_mp_id: number; numero_lot: string | null; quantite: number }[] | null) ?? []) {
      const key = `${row.article_mp_id}::${(row.numero_lot || "").trim()}`;
      reservedMpProductionByArticleLot.set(
        key,
        (reservedMpProductionByArticleLot.get(key) ?? 0) + Number(row.quantite ?? 0)
      );
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
      };
    })
    .filter((row) => Math.abs(row.solde) > 1e-6)
    .sort(
      (a, b) => a.nom.localeCompare(b.nom, "fr", { sensitivity: "base" }) || a.numeroLot.localeCompare(b.numeroLot)
    );

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

        <section className="overflow-hidden rounded-[1.75rem] border border-black/5 bg-white shadow-[0_18px_50px_rgba(15,23,42,0.08)]">
          <h2 className="border-b border-slate-100 px-6 py-4 text-sm font-bold uppercase tracking-wide text-slate-500">
            Produit fini
          </h2>
          {stockPf.length === 0 ? (
            <p className="px-6 py-6 text-sm text-slate-500">Aucun stock produit fini dans ce depot.</p>
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
                  {stockPf.map((row) => (
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
                        {row.reserve > 1e-6 ? formatNumber(row.reserve) : "-"}
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
                  {stockMp.map((row) => (
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
                        {row.reserve > 1e-6 ? formatNumber(row.reserve) : "-"}
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
