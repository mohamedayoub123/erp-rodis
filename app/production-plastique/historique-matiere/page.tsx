import { unstable_noStore as noStore } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import { BackButton } from "@/app/_components/back-button";
import { RefreshButton } from "@/app/_components/refresh-button";

type SearchParams = Promise<{ code?: string }>;

type LigneAffichee = {
  articleMpId: number;
  nomArticle: string;
  numeroLot: string;
  quantite: number;
  prixUnitaireFcfa: number | null;
  totalFcfa: number | null;
};

type ProduitDuProgramme = {
  articleId: number;
  nomArticle: string;
  numeroLot: string;
  quantite: number;
  lignes: LigneAffichee[];
  coutTotal: number;
};

type ProgrammePlastiqueBatch = {
  groupeId: number;
  date: string;
  produits: ProduitDuProgramme[];
  coutTotal: number;
};

function formatNumber(value: number, decimals = 3) {
  return value.toLocaleString("fr-FR", { maximumFractionDigits: decimals });
}

async function fetchHistoriquePlastique(codeFilter: string): Promise<ProgrammePlastiqueBatch[]> {
  const { data } = await supabaseServer
    .from("lots_stock_matiere_premiere")
    .select("id, article_id, numero_lot, qte_entree, qte_sortie, date_jour, mouvement_groupe_id")
    .eq("source_import", "web:programme-plastique")
    .order("id", { ascending: false })
    .limit(1000);
  const rows = (data ?? []) as {
    id: number;
    article_id: number;
    numero_lot: string | null;
    qte_entree: number;
    qte_sortie: number;
    date_jour: string;
    mouvement_groupe_id: number | null;
  }[];

  const byGroup = new Map<number, typeof rows>();
  for (const row of rows) {
    const groupeId = row.mouvement_groupe_id ?? row.id;
    const list = byGroup.get(groupeId) ?? [];
    list.push(row);
    byGroup.set(groupeId, list);
  }

  const articleIds = [...new Set(rows.map((r) => r.article_id))];
  const [{ data: articlesData }, { data: recettesData }] = await Promise.all([
    supabaseServer.from("articles_matiere_premiere").select("id, nom_article").in("id", articleIds.length > 0 ? articleIds : [0]),
    supabaseServer
      .from("recettes_plastique")
      .select("article_produit_id, article_matiere_id")
      .in("article_produit_id", articleIds.length > 0 ? articleIds : [0]),
  ]);
  const nomById = new Map(
    ((articlesData ?? []) as { id: number; nom_article: string }[]).map((a) => [a.id, a.nom_article])
  );
  // Quelle(s) matiere(s) appartiennent a la recette de chaque article produit
  // - sert a attribuer chaque ligne de consommation au BON produit du
  // programme, plutot que de tout melanger ensemble quand un programme
  // contient plusieurs articles sans code propre pour les distinguer.
  const ingredientsParProduit = new Map<number, Set<number>>();
  for (const r of (recettesData ?? []) as { article_produit_id: number; article_matiere_id: number }[]) {
    const set = ingredientsParProduit.get(r.article_produit_id) ?? new Set<number>();
    set.add(r.article_matiere_id);
    ingredientsParProduit.set(r.article_produit_id, set);
  }

  const batches: ProgrammePlastiqueBatch[] = [];
  for (const [groupeId, groupRows] of byGroup.entries()) {
    const produitsRows = groupRows.filter((r) => Number(r.qte_entree) > 0);
    const consommationRows = groupRows.filter((r) => Number(r.qte_sortie) > 0);
    if (produitsRows.length === 0) continue;

    if (codeFilter) {
      const matches = produitsRows.some((r) => (r.numero_lot ?? "").toUpperCase().includes(codeFilter));
      if (!matches) continue;
    }

    const consommationRestantes = new Set(consommationRows);
    const produits: ProduitDuProgramme[] = [];

    for (const produitRow of produitsRows) {
      const ingredients = ingredientsParProduit.get(produitRow.article_id) ?? new Set<number>();
      const lignesDuProduit: LigneAffichee[] = [];

      for (const row of consommationRows) {
        if (!ingredients.has(row.article_id) || !consommationRestantes.has(row)) continue;
        consommationRestantes.delete(row);

        let prixUnitaireFcfa: number | null = null;
        if (row.numero_lot) {
          const { data: entreeRow } = await supabaseServer
            .from("lots_stock_matiere_premiere")
            .select("prix_unitaire")
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

        lignesDuProduit.push({
          articleMpId: row.article_id,
          nomArticle: nomById.get(row.article_id) ?? `Article #${row.article_id}`,
          numeroLot: row.numero_lot ?? "-",
          quantite: Number(row.qte_sortie),
          prixUnitaireFcfa,
          totalFcfa: prixUnitaireFcfa !== null ? Number(row.qte_sortie) * prixUnitaireFcfa : null,
        });
      }

      const coutTotalProduit = lignesDuProduit.reduce((sum, l) => sum + (l.totalFcfa ?? 0), 0);
      produits.push({
        articleId: produitRow.article_id,
        nomArticle: nomById.get(produitRow.article_id) ?? `Article #${produitRow.article_id}`,
        numeroLot: produitRow.numero_lot ?? "-",
        quantite: Number(produitRow.qte_entree),
        lignes: lignesDuProduit,
        coutTotal: coutTotalProduit,
      });
    }

    // Reste (matiere consommee sans recette trouvee pour aucun produit du
    // programme - ne devrait normalement pas arriver) - jamais silencieusement
    // perdue, rattachee au premier produit plutot que masquee.
    if (consommationRestantes.size > 0 && produits.length > 0) {
      for (const row of consommationRestantes) {
        let prixUnitaireFcfa: number | null = null;
        if (row.numero_lot) {
          const { data: entreeRow } = await supabaseServer
            .from("lots_stock_matiere_premiere")
            .select("prix_unitaire")
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
        const ligne: LigneAffichee = {
          articleMpId: row.article_id,
          nomArticle: nomById.get(row.article_id) ?? `Article #${row.article_id}`,
          numeroLot: row.numero_lot ?? "-",
          quantite: Number(row.qte_sortie),
          prixUnitaireFcfa,
          totalFcfa: prixUnitaireFcfa !== null ? Number(row.qte_sortie) * prixUnitaireFcfa : null,
        };
        produits[0].lignes.push(ligne);
        produits[0].coutTotal += ligne.totalFcfa ?? 0;
      }
    }

    const coutTotal = produits.reduce((sum, p) => sum + p.coutTotal, 0);
    batches.push({ groupeId, date: groupRows[0]?.date_jour ?? "-", produits, coutTotal });
  }

  return batches.sort((a, b) => b.groupeId - a.groupeId);
}

export default async function HistoriqueMatierePlastiquePage({ searchParams }: { searchParams: SearchParams }) {
  noStore();
  const params = await searchParams;
  const code = (params.code || "").trim().toUpperCase();

  const batches = await fetchHistoriquePlastique(code);
  const batchesAffiches = code ? batches : batches.slice(0, 20);

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#f4efe5_0%,#fbf8f2_45%,#ffffff_100%)] px-4 py-6 text-slate-900 lg:px-8">
      <div className="mx-auto w-full space-y-6">
        <section className="rounded-[1.75rem] border border-black/5 bg-white p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.16em] text-blue-700">
                Production Plastique
              </p>
              <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-900">
                Historique Matiere Utilisee
              </h1>
              <p className="mt-2 text-sm text-slate-600">
                Cherche un code (lot du flacon/capsule/pot produit) pour retrouver son programme. Chaque
                programme est detaille article par article, avec sa propre matiere. Sans recherche, les 20
                derniers programmes s&apos;affichent.
              </p>
            </div>

            <div className="flex items-center gap-3">
              <BackButton href="/production-plastique" label="Retour" />
              <RefreshButton />
            </div>
          </div>
        </section>

        <section className="rounded-[1.75rem] border border-black/5 bg-white p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
          <form className="grid gap-3 sm:grid-cols-[1fr_auto]">
            <input
              type="text"
              name="code"
              defaultValue={code}
              placeholder="Ex: 15"
              className="rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none"
            />
            <button type="submit" className="rounded-2xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white">
              Chercher
            </button>
          </form>

          {batchesAffiches.length === 0 ? (
            <p className="mt-4 text-sm text-slate-500">
              {code ? "Aucun programme trouve pour ce code." : "Aucun programme plastique pour le moment."}
            </p>
          ) : (
            <div className="mt-4 space-y-4">
              {batchesAffiches.map((batch) => (
                <details key={batch.groupeId} className="rounded-2xl border border-slate-100 p-4" open={Boolean(code)}>
                  <summary className="cursor-pointer text-sm font-semibold text-slate-900">
                    Programme {batch.date} -{" "}
                    {batch.produits.map((p) => `${p.nomArticle} (${formatNumber(p.quantite, 0)}, lot ${p.numeroLot})`).join(", ")}{" "}
                    - {formatNumber(batch.coutTotal, 0)} FCFA
                  </summary>

                  <div className="mt-3 space-y-4">
                    {batch.produits.map((produit) => (
                      <div key={`${produit.articleId}-${produit.numeroLot}`}>
                        <p className="text-sm font-semibold text-slate-700">
                          {produit.nomArticle} - lot {produit.numeroLot} ({formatNumber(produit.quantite, 0)})
                        </p>
                        {produit.lignes.length === 0 ? (
                          <p className="mt-1 text-xs text-slate-500">Aucune matiere consommee tracee.</p>
                        ) : (
                          <div className="mt-1 overflow-x-auto rounded-xl border border-slate-100">
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
                                {produit.lignes.map((ligne, index) => (
                                  <tr key={`${ligne.articleMpId}-${ligne.numeroLot}-${index}`} className="border-t border-slate-100">
                                    <td className="px-4 py-2 font-medium text-slate-900">{ligne.nomArticle}</td>
                                    <td className="px-4 py-2 text-slate-600">{ligne.numeroLot}</td>
                                    <td className="px-4 py-2 text-slate-600">{formatNumber(ligne.quantite)}</td>
                                    <td className="px-4 py-2 text-slate-600">
                                      {ligne.prixUnitaireFcfa !== null ? `${formatNumber(ligne.prixUnitaireFcfa, 2)} FCFA` : "Prix inconnu"}
                                    </td>
                                    <td className="px-4 py-2 text-slate-600">
                                      {ligne.totalFcfa !== null ? `${formatNumber(ligne.totalFcfa, 0)} FCFA` : "-"}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </details>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
