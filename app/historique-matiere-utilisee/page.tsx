import { unstable_noStore as noStore } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import { BackButton } from "@/app/_components/back-button";
import { RefreshButton } from "@/app/_components/refresh-button";
import { convertirEnFcfa } from "@/lib/prix-devise";

type SearchParams = Promise<{ code?: string }>;

type LigneAffichee = {
  articleMpId: number;
  nomArticle: string;
  numeroLot: string;
  quantite: number;
  prixUnitaireFcfa: number | null;
  totalFcfa: number | null;
};

function formatNumber(value: number, decimals = 3) {
  return value.toLocaleString("fr-FR", { maximumFractionDigits: decimals });
}

// Prend directement dans production_mp_reserve (jamais fetchCoutReelDepuisReservation
// seul, qui omet completement les lignes sans prix connu) - la quantite
// consommee doit rester visible meme quand le prix est inconnu, demande
// explicite : "il a bien utilise flacon et capsule mais je le vois pas ici".
async function fetchTraceCosmetique(code: string): Promise<{
  lignes: LigneAffichee[];
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
    return { lignes: [], produit: null, coutTotal: 0 };
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

  const { data: reserveRows } = await supabaseServer
    .from("production_mp_reserve")
    .select("article_mp_id, numero_lot, quantite_initiale, quantite")
    .in("production_code_termine_id", termines.map((t) => t.id));
  const reserves = (reserveRows ?? []) as {
    article_mp_id: number;
    numero_lot: string | null;
    quantite_initiale: number;
    quantite: number;
  }[];

  const articleIds = [...new Set(reserves.map((r) => r.article_mp_id))];
  const { data: articlesData } = await supabaseServer
    .from("articles_matiere_premiere")
    .select("id, nom_article")
    .in("id", articleIds.length > 0 ? articleIds : [0]);
  const nomById = new Map(
    ((articlesData ?? []) as { id: number; nom_article: string }[]).map((a) => [a.id, a.nom_article])
  );

  const lignes: LigneAffichee[] = [];
  for (const reserve of reserves) {
    const consomme = Math.max(0, reserve.quantite_initiale - reserve.quantite);
    if (consomme <= 1e-9) continue;

    let prixUnitaireFcfa: number | null = null;
    if (reserve.numero_lot) {
      const { data: entreeRow } = await supabaseServer
        .from("lots_stock_matiere_premiere")
        .select("prix_unitaire, devise, taux_change")
        .eq("article_id", reserve.article_mp_id)
        .eq("numero_lot", reserve.numero_lot)
        .gt("qte_entree", 0)
        .not("prix_unitaire", "is", null)
        .limit(1)
        .maybeSingle();
      if (entreeRow?.prix_unitaire != null) {
        prixUnitaireFcfa = convertirEnFcfa(
          Number(entreeRow.prix_unitaire),
          entreeRow.devise as string | null,
          entreeRow.taux_change as number | null
        );
      }
    }

    lignes.push({
      articleMpId: reserve.article_mp_id,
      nomArticle: nomById.get(reserve.article_mp_id) ?? `Article #${reserve.article_mp_id}`,
      numeroLot: reserve.numero_lot ?? "-",
      quantite: consomme,
      prixUnitaireFcfa,
      totalFcfa: prixUnitaireFcfa !== null ? consomme * prixUnitaireFcfa : null,
    });
  }
  const coutTotal = lignes.reduce((sum, l) => sum + (l.totalFcfa ?? 0), 0);

  return { lignes, produit, coutTotal };
}

export default async function HistoriqueMatiereUtiliseePage({ searchParams }: { searchParams: SearchParams }) {
  noStore();
  const params = await searchParams;
  const code = (params.code || "").trim().toUpperCase();

  const traceCosmetique = code ? await fetchTraceCosmetique(code) : null;

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#f4efe5_0%,#fbf8f2_45%,#ffffff_100%)] px-4 py-6 text-slate-900 lg:px-8">
      <div className="mx-auto w-full space-y-6">
        <section className="rounded-[1.75rem] border border-black/5 bg-white p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.16em] text-blue-700">ERP Rodis</p>
              <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-900">
                Historique Matiere Utilisee - Produit Fini
              </h1>
              <p className="mt-2 text-sm text-slate-600">
                Cherche un code de production (cosmetique) pour voir quelle matiere premiere a ete utilisee -
                quantite, lot et prix.
              </p>
            </div>

            <div className="flex items-center gap-3">
              <BackButton href="/production" label="Retour" />
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
              placeholder="Ex: AA4263V"
              className="rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none"
            />
            <button type="submit" className="rounded-2xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white">
              Chercher
            </button>
          </form>

          {code ? (
            traceCosmetique && traceCosmetique.lignes.length > 0 ? (
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
              </div>
            ) : (
              <p className="mt-4 text-sm text-slate-500">Aucune matiere tracee pour ce code.</p>
            )
          ) : null}
        </section>
      </div>
    </main>
  );
}
