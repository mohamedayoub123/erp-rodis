import Link from "next/link";
import { unstable_noStore as noStore } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import { BackButton } from "@/app/_components/back-button";
import { RefreshButton } from "@/app/_components/refresh-button";
import { fetchCoutReelDepuisReservation, type LotUtiliseInfo } from "@/lib/prix-revient";

type SearchParams = Promise<{ code?: string }>;

type LigneAffichee = {
  articleMpId: number;
  nomArticle: string;
  numeroLot: string;
  quantite: number;
  prixUnitaireFcfa: number;
  totalFcfa: number;
};

function formatNumber(value: number, decimals = 3) {
  return value.toLocaleString("fr-FR", { maximumFractionDigits: decimals });
}

async function fetchTraceCosmetique(code: string): Promise<{
  lignes: LigneAffichee[];
  lignesSansPrix: string[];
  produit: string | null;
  coutTotal: number;
}> {
  const { data: termineRows } = await supabaseServer
    .from("production_code_termine")
    .select("id, programme_ligne_id, stage")
    .eq("code", code)
    .in("stage", ["pesage", "salle_conditionnement"]);
  const termines = (termineRows ?? []) as { id: number; programme_ligne_id: number; stage: string }[];

  if (termines.length === 0) {
    return { lignes: [], lignesSansPrix: [], produit: null, coutTotal: 0 };
  }

  const ligneIds = [...new Set(termines.map((t) => t.programme_ligne_id))];
  const { data: ligneRows } = await supabaseServer
    .from("programme_lignes")
    .select("id, produit")
    .in("id", ligneIds);
  const produitByLigneId = new Map(
    ((ligneRows ?? []) as { id: number; produit: string | null }[]).map((l) => [l.id, l.produit])
  );
  const produit = produitByLigneId.get(termines[0].programme_ligne_id) ?? null;

  const allLotsUtilises: LotUtiliseInfo[] = [];
  const allLignesSansPrixIds: number[] = [];
  for (const termine of termines) {
    const info = await fetchCoutReelDepuisReservation(termine.id);
    if (!info) continue;
    allLotsUtilises.push(...info.lotsUtilises);
    allLignesSansPrixIds.push(...info.lignesSansPrix);
  }

  const articleIds = [
    ...new Set([...allLotsUtilises.map((l) => l.articleMpId), ...allLignesSansPrixIds]),
  ];
  const { data: articlesData } = await supabaseServer
    .from("articles_matiere_premiere")
    .select("id, nom_article")
    .in("id", articleIds.length > 0 ? articleIds : [0]);
  const nomById = new Map(
    ((articlesData ?? []) as { id: number; nom_article: string }[]).map((a) => [a.id, a.nom_article])
  );

  const lignes: LigneAffichee[] = allLotsUtilises.map((l) => ({
    articleMpId: l.articleMpId,
    nomArticle: nomById.get(l.articleMpId) ?? `Article #${l.articleMpId}`,
    numeroLot: l.numeroLot,
    quantite: l.quantite,
    prixUnitaireFcfa: l.prixUnitaireFcfa,
    totalFcfa: l.quantite * l.prixUnitaireFcfa,
  }));
  const lignesSansPrix = [...new Set(allLignesSansPrixIds)].map(
    (id) => nomById.get(id) ?? `Article #${id}`
  );
  const coutTotal = lignes.reduce((sum, l) => sum + l.totalFcfa, 0);

  return { lignes, lignesSansPrix, produit, coutTotal };
}

type ProgrammePlastiqueBatch = {
  groupeId: number;
  date: string;
  produits: { nomArticle: string; numeroLot: string; quantite: number }[];
  lignes: LigneAffichee[];
  lignesSansPrix: string[];
  coutTotal: number;
};

async function fetchHistoriquePlastique(): Promise<ProgrammePlastiqueBatch[]> {
  const { data } = await supabaseServer
    .from("lots_stock_matiere_premiere")
    .select("id, article_id, numero_lot, qte_entree, qte_sortie, date_jour, mouvement_groupe_id, note")
    .eq("source_import", "web:programme-plastique")
    .order("id", { ascending: false })
    .limit(500);
  const rows = (data ?? []) as {
    id: number;
    article_id: number;
    numero_lot: string | null;
    qte_entree: number;
    qte_sortie: number;
    date_jour: string;
    mouvement_groupe_id: number | null;
    note: string | null;
  }[];

  const byGroup = new Map<number, typeof rows>();
  for (const row of rows) {
    const groupeId = row.mouvement_groupe_id ?? row.id;
    const list = byGroup.get(groupeId) ?? [];
    list.push(row);
    byGroup.set(groupeId, list);
  }

  const articleIds = [...new Set(rows.map((r) => r.article_id))];
  const { data: articlesData } = await supabaseServer
    .from("articles_matiere_premiere")
    .select("id, nom_article")
    .in("id", articleIds.length > 0 ? articleIds : [0]);
  const nomById = new Map(
    ((articlesData ?? []) as { id: number; nom_article: string }[]).map((a) => [a.id, a.nom_article])
  );

  const batches: ProgrammePlastiqueBatch[] = [];
  for (const [groupeId, groupRows] of byGroup.entries()) {
    const produitsRows = groupRows.filter((r) => Number(r.qte_entree) > 0);
    const consommationRows = groupRows.filter((r) => Number(r.qte_sortie) > 0);
    if (produitsRows.length === 0 && consommationRows.length === 0) continue;

    const produits = produitsRows.map((r) => ({
      nomArticle: nomById.get(r.article_id) ?? `Article #${r.article_id}`,
      numeroLot: r.numero_lot ?? "-",
      quantite: Number(r.qte_entree),
    }));

    const lignes: LigneAffichee[] = [];
    const lignesSansPrixIds: number[] = [];
    for (const row of consommationRows) {
      let prixUnitaireFcfa: number | null = null;
      if (row.numero_lot) {
        const { data: entreeRow } = await supabaseServer
          .from("lots_stock_matiere_premiere")
          .select("prix_unitaire, devise, taux_change")
          .eq("article_id", row.article_id)
          .eq("numero_lot", row.numero_lot)
          .gt("qte_entree", 0)
          .not("prix_unitaire", "is", null)
          .limit(1)
          .maybeSingle();
        if (entreeRow?.prix_unitaire != null) {
          prixUnitaireFcfa = Number(entreeRow.prix_unitaire);
        }
      }
      if (prixUnitaireFcfa === null) {
        lignesSansPrixIds.push(row.article_id);
        continue;
      }
      lignes.push({
        articleMpId: row.article_id,
        nomArticle: nomById.get(row.article_id) ?? `Article #${row.article_id}`,
        numeroLot: row.numero_lot ?? "-",
        quantite: Number(row.qte_sortie),
        prixUnitaireFcfa,
        totalFcfa: Number(row.qte_sortie) * prixUnitaireFcfa,
      });
    }
    const lignesSansPrix = [...new Set(lignesSansPrixIds)].map((id) => nomById.get(id) ?? `Article #${id}`);
    const coutTotal = lignes.reduce((sum, l) => sum + l.totalFcfa, 0);

    batches.push({
      groupeId,
      date: groupRows[0]?.date_jour ?? "-",
      produits,
      lignes,
      lignesSansPrix,
      coutTotal,
    });
  }

  return batches.sort((a, b) => b.groupeId - a.groupeId);
}

export default async function HistoriqueMatiereUtiliseePage({ searchParams }: { searchParams: SearchParams }) {
  noStore();
  const params = await searchParams;
  const code = (params.code || "").trim().toUpperCase();

  const [traceCosmetique, batchesPlastique] = await Promise.all([
    code ? fetchTraceCosmetique(code) : Promise.resolve(null),
    fetchHistoriquePlastique(),
  ]);

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#f4efe5_0%,#fbf8f2_45%,#ffffff_100%)] px-4 py-6 text-slate-900 lg:px-8">
      <div className="mx-auto w-full space-y-6">
        <section className="rounded-[1.75rem] border border-black/5 bg-white p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.16em] text-blue-700">ERP Rodis</p>
              <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-900">
                Historique Matiere Utilisee
              </h1>
              <p className="mt-2 text-sm text-slate-600">
                Quelle matiere premiere (quantite, lot, prix) a ete utilisee par chaque code de production -
                cosmetique et plastique.
              </p>
            </div>

            <div className="flex items-center gap-3">
              <BackButton href="/" label="Retour accueil" />
              <RefreshButton />
            </div>
          </div>
        </section>

        <section className="rounded-[1.75rem] border border-black/5 bg-white p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
          <h2 className="text-lg font-bold text-slate-900">Cosmetique - par code</h2>
          <form className="mt-3 grid gap-3 sm:grid-cols-[1fr_auto]">
            <input
              type="text"
              name="code"
              defaultValue={code}
              placeholder="Ex: AA4263V"
              className="rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none"
            />
            <button type="submit" className="rounded-2xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white">
              Chercher
            </button>
          </form>

          {code ? (
            traceCosmetique && (traceCosmetique.lignes.length > 0 || traceCosmetique.lignesSansPrix.length > 0) ? (
              <div className="mt-4">
                {traceCosmetique.produit ? (
                  <p className="text-sm font-semibold text-slate-700">{traceCosmetique.produit}</p>
                ) : null}
                <div className="mt-2 overflow-x-auto rounded-xl border border-slate-100">
                  <table className="min-w-full text-left text-sm">
                    <thead className="bg-slate-50 text-slate-500">
                      <tr>
                        <th className="px-4 py-2 font-semibold">Matiere</th>
                        <th className="px-4 py-2 font-semibold">Lot</th>
                        <th className="px-4 py-2 font-semibold">Quantite</th>
                        <th className="px-4 py-2 font-semibold">Prix unitaire</th>
                        <th className="px-4 py-2 font-semibold">Total</th>
                      </tr>
                    </thead>
                    <tfoot>
                      <tr className="border-t border-slate-200 bg-slate-50 font-semibold">
                        <td className="px-4 py-2" colSpan={4}>
                          Total
                        </td>
                        <td className="px-4 py-2">{formatNumber(traceCosmetique.coutTotal, 0)} FCFA</td>
                      </tr>
                    </tfoot>
                    <tbody>
                      {traceCosmetique.lignes.map((ligne, index) => (
                        <tr key={`${ligne.articleMpId}-${ligne.numeroLot}-${index}`} className="border-t border-slate-100">
                          <td className="px-4 py-2 font-medium text-slate-900">{ligne.nomArticle}</td>
                          <td className="px-4 py-2 text-slate-600">{ligne.numeroLot}</td>
                          <td className="px-4 py-2 text-slate-600">{formatNumber(ligne.quantite)}</td>
                          <td className="px-4 py-2 text-slate-600">{formatNumber(ligne.prixUnitaireFcfa, 2)} FCFA</td>
                          <td className="px-4 py-2 text-slate-600">{formatNumber(ligne.totalFcfa, 0)} FCFA</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {traceCosmetique.lignesSansPrix.length > 0 ? (
                  <p className="mt-3 rounded-2xl bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800">
                    Sans prix connu : {traceCosmetique.lignesSansPrix.join(", ")}
                  </p>
                ) : null}
              </div>
            ) : (
              <p className="mt-4 text-sm text-slate-500">Aucune matiere tracee pour ce code.</p>
            )
          ) : null}
        </section>

        <section className="rounded-[1.75rem] border border-black/5 bg-white p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
          <h2 className="text-lg font-bold text-slate-900">Plastique - par programme</h2>

          {batchesPlastique.length === 0 ? (
            <p className="mt-3 text-sm text-slate-500">Aucun programme plastique pour le moment.</p>
          ) : (
            <div className="mt-3 space-y-4">
              {batchesPlastique.map((batch) => (
                <details key={batch.groupeId} className="rounded-2xl border border-slate-100 p-4">
                  <summary className="cursor-pointer text-sm font-semibold text-slate-900">
                    {batch.date} -{" "}
                    {batch.produits.map((p) => `${p.nomArticle} (${formatNumber(p.quantite, 0)}, lot ${p.numeroLot})`).join(", ") ||
                      "Produit inconnu"}{" "}
                    - {formatNumber(batch.coutTotal, 0)} FCFA
                  </summary>

                  <div className="mt-3 overflow-x-auto rounded-xl border border-slate-100">
                    <table className="min-w-full text-left text-sm">
                      <thead className="bg-slate-50 text-slate-500">
                        <tr>
                          <th className="px-4 py-2 font-semibold">Matiere</th>
                          <th className="px-4 py-2 font-semibold">Lot</th>
                          <th className="px-4 py-2 font-semibold">Quantite</th>
                          <th className="px-4 py-2 font-semibold">Prix unitaire</th>
                          <th className="px-4 py-2 font-semibold">Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {batch.lignes.map((ligne, index) => (
                          <tr key={`${ligne.articleMpId}-${ligne.numeroLot}-${index}`} className="border-t border-slate-100">
                            <td className="px-4 py-2 font-medium text-slate-900">{ligne.nomArticle}</td>
                            <td className="px-4 py-2 text-slate-600">{ligne.numeroLot}</td>
                            <td className="px-4 py-2 text-slate-600">{formatNumber(ligne.quantite)}</td>
                            <td className="px-4 py-2 text-slate-600">{formatNumber(ligne.prixUnitaireFcfa, 2)} FCFA</td>
                            <td className="px-4 py-2 text-slate-600">{formatNumber(ligne.totalFcfa, 0)} FCFA</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {batch.lignesSansPrix.length > 0 ? (
                    <p className="mt-3 rounded-2xl bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800">
                      Sans prix connu : {batch.lignesSansPrix.join(", ")}
                    </p>
                  ) : null}
                </details>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
