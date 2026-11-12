import Link from "next/link";
import { notFound } from "next/navigation";
import { supabaseServer } from "@/lib/supabase-server";
import { BackButton } from "@/app/_components/back-button";
import { RefreshButton } from "@/app/_components/refresh-button";
import { formatDate } from "@/lib/format-date";
import { canDeletePageUser, getCurrentStockUser } from "@/lib/stock-auth";
import { SupprimerCommandeButton } from "../supprimer-commande-button";
import {
  lireLivraisonsDepotFVersDepotE,
  lireQuantiteCommande,
  resteAFabriquer,
  type LivraisonArticle,
} from "@/lib/livraisons-depot-f-vers-e";

type CommandeRow = {
  id: number;
  code: string;
  created_at: string;
  created_by: string | null;
};

type LigneRow = {
  id: number;
  article_id: number;
  nom_article: string;
  categorie: string | null;
  gamme: string | null;
  qt_avis: string | null;
  stock_actuel: number;
};

function formatNumber(value: number) {
  return value.toLocaleString("fr-FR", { maximumFractionDigits: 2 });
}

export default async function CommandeArticlePlastiqueDetailPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;

  const { data: commande } = await supabaseServer
    .from("commandes_article_plastique")
    .select("id, code, created_at, created_by")
    .eq("code", code)
    .maybeSingle();

  if (!commande) notFound();

  const { data: lignesData } = await supabaseServer
    .from("commandes_article_plastique_lignes")
    .select("id, article_id, nom_article, categorie, gamme, qt_avis, stock_actuel")
    .eq("commande_id", (commande as CommandeRow).id)
    .order("nom_article", { ascending: true });
  const lignes = (lignesData ?? []) as LigneRow[];
  const canDelete = await canDeletePageUser(await getCurrentStockUser(), "productionPlastiqueCommandes");

  // Ce qui est deja arrive au Depot E pendant la vie de cette commande : Transfer Invoice valides du Depot F au Depot E crees
  // depuis son enregistrement et jusqu'a la commande suivante (ce qui n'est pas livre a ce moment-la est reporte sur la commande
  // suivante, voir la colonne "A fabriquer" de Statistique Article Plastique (E3)) ; la derniere commande va jusqu'a maintenant.
  let livraisons = new Map<number, LivraisonArticle>();
  let erreurLivraisons: string | null = null;
  try {
    const { data: suivante } = await supabaseServer
      .from("commandes_article_plastique")
      .select("created_at")
      .gt("created_at", (commande as CommandeRow).created_at)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    livraisons = await lireLivraisonsDepotFVersDepotE({
      articleIds: lignes.map((ligne) => ligne.article_id),
      depuis: (commande as CommandeRow).created_at,
      avant: (suivante as { created_at: string } | null)?.created_at ?? null,
    });
  } catch (e) {
    erreurLivraisons = `Livraisons du Depot F au Depot E illisibles : ${e instanceof Error ? e.message : "erreur inconnue"}`;
  }

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
                Commande {(commande as CommandeRow).code}
              </h1>
              <p className="mt-2 text-sm text-slate-600">
                {formatDate((commande as CommandeRow).created_at.slice(0, 10))}
                {(commande as CommandeRow).created_by ? ` - ${(commande as CommandeRow).created_by}` : ""}
              </p>
            </div>

            <div className="flex items-center gap-3">
              <BackButton href="/production-plastique/commandes" label="Retour commandes" />
              {canDelete ? (
                <SupprimerCommandeButton
                  commandeId={(commande as CommandeRow).id}
                  code={(commande as CommandeRow).code}
                  retourListe
                />
              ) : null}
              <RefreshButton />
            </div>
          </div>
        </section>

        <section className="overflow-hidden rounded-[1.75rem] border border-black/5 bg-white shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
          {erreurLivraisons ? <p className="px-6 pt-6 text-sm font-medium text-red-700">{erreurLivraisons}</p> : null}
          {lignes.length === 0 ? (
            <p className="px-6 py-8 text-sm text-slate-500">Aucun article dans cette commande.</p>
          ) : (
            <table className="min-w-full text-left text-sm">
              <thead className="bg-slate-50 text-slate-500">
                <tr>
                  <th className="px-6 py-4 font-semibold">Article</th>
                  <th className="px-6 py-4 font-semibold">Gamme</th>
                  <th className="px-6 py-4 font-semibold">Categorie</th>
                  <th className="px-6 py-4 font-semibold">Qt avis</th>
                  <th className="px-6 py-4 font-semibold">
                    Livre
                    <span className="block text-xs font-normal text-slate-400">Depot F vers Depot E</span>
                  </th>
                  <th className="px-6 py-4 font-semibold">Reste a fabriquer</th>
                  <th className="px-6 py-4 font-semibold">Stock actuel</th>
                </tr>
              </thead>
              <tbody>
                {lignes.map((ligne) => {
                  const livraison = livraisons.get(ligne.article_id);
                  const livre = livraison?.livre ?? 0;
                  const reste = erreurLivraisons ? null : resteAFabriquer(ligne.qt_avis, livre);
                  const resteNombre = lireQuantiteCommande(reste);
                  return (
                    <tr key={ligne.id} className="border-t border-slate-100">
                      <td className="px-6 py-4 font-medium text-slate-900">{ligne.nom_article}</td>
                      <td className="px-6 py-4 text-slate-600">{ligne.gamme || "-"}</td>
                      <td className="px-6 py-4 text-slate-600">{ligne.categorie || "-"}</td>
                      <td className="px-6 py-4 font-semibold text-emerald-700">{ligne.qt_avis || "-"}</td>
                      <td className="px-6 py-4 text-slate-600">
                        {livre > 0 ? (
                          <details>
                            <summary className="cursor-pointer text-sm font-semibold text-sky-700">{formatNumber(livre)}</summary>
                            <ul className="mt-1 space-y-1 text-xs text-slate-700">
                              {(livraison?.tis ?? []).map((ti) => (
                                <li key={ti.code}>
                                  <Link href={ti.href} className="font-semibold text-sky-700 hover:underline">
                                    {ti.code}
                                  </Link>{" "}
                                  : {formatNumber(ti.quantite)}
                                </li>
                              ))}
                            </ul>
                          </details>
                        ) : (
                          "-"
                        )}
                      </td>
                      <td
                        className={`px-6 py-4 font-bold ${
                          reste !== null && resteNombre !== null && resteNombre <= 0 ? "text-emerald-700" : "text-red-600"
                        }`}
                      >
                        {reste === null ? "-" : resteNombre !== null ? formatNumber(resteNombre) : reste}
                      </td>
                      <td className="px-6 py-4 text-slate-600">{formatNumber(ligne.stock_actuel)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </section>
      </div>
    </main>
  );
}
