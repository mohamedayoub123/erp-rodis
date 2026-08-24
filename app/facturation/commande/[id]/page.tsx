import { notFound } from "next/navigation";
import Link from "next/link";
import { unstable_noStore as noStore } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import { canDeletePageUser, canWritePageUser, getCurrentStockUser } from "@/lib/stock-auth";
import { BackButton } from "@/app/_components/back-button";
import { RefreshButton } from "@/app/_components/refresh-button";
import { DeleteIconButton } from "@/app/_components/delete-icon-button";
import { formatDate } from "@/lib/format-date";
import { deleteCommandeAction } from "../actions";
import { createBonLivraisonAction } from "../../bl/actions";

type CommandeRow = {
  id: number;
  numero: number | null;
  date_jour: string;
  client: string;
  depot_source_id: number;
  cree_par: string | null;
};
type LigneRow = { id: number; article_id: number; quantite_demandee: number };

async function fetchNomArticle(articleId: number): Promise<string> {
  const { data } = await supabaseServer.from("articles").select("nom_article").eq("id", articleId).maybeSingle();
  return (data as { nom_article: string } | null)?.nom_article ?? `#${articleId}`;
}

export default async function CommandeDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ avertissement?: string }>;
}) {
  noStore();
  const { id } = await params;
  const commandeId = Number(id);
  if (!commandeId) {
    notFound();
  }
  const { avertissement } = await searchParams;

  const currentUser = await getCurrentStockUser();
  const canWrite = await canWritePageUser(currentUser, "facturationCommande");
  const canDelete = await canDeletePageUser(currentUser, "facturationCommande");
  const canCreateBl = await canWritePageUser(currentUser, "facturationBl");

  const { data: commandeData } = await supabaseServer
    .from("facturation_commandes")
    .select("id, numero, date_jour, client, depot_source_id, cree_par")
    .eq("id", commandeId)
    .maybeSingle();

  const commande = commandeData as CommandeRow | null;
  if (!commande) {
    notFound();
  }

  const [{ data: depotData }, { data: lignesData }, { data: blData }] = await Promise.all([
    supabaseServer.from("depots").select("nom").eq("id", commande.depot_source_id).maybeSingle(),
    supabaseServer
      .from("facturation_commande_lignes")
      .select("id, article_id, quantite_demandee")
      .eq("commande_id", commandeId)
      .order("id", { ascending: true }),
    supabaseServer.from("bons_livraison").select("id").eq("commande_id", commandeId).maybeSingle(),
  ]);

  const depotNom = (depotData as { nom: string } | null)?.nom ?? "-";
  const bl = blData as { id: number } | null;
  const lignesEnrichies = await Promise.all(
    ((lignesData ?? []) as LigneRow[]).map(async (ligne) => ({ ...ligne, nomArticle: await fetchNomArticle(ligne.article_id) }))
  );

  const code = `CMD.${commande.date_jour.slice(0, 4)}.${commande.numero ?? commande.id}`;

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#edf8ff_0%,#f8fcff_48%,#ffffff_100%)] px-4 py-6 text-slate-900 lg:px-8">
      <div className="mx-auto w-full max-w-4xl space-y-6">
        <section className="rounded-[1.75rem] border border-black/5 bg-white p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.16em] text-sky-700">ERP Rodis</p>
              <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-900">{code}</h1>
              <p className="mt-2 text-sm text-slate-600">
                {formatDate(commande.date_jour)} - {commande.client} - Depot {depotNom}
                {commande.cree_par ? ` - Cree par ${commande.cree_par}` : ""}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <BackButton href="/facturation/commande" label="Retour Commande" />
              <RefreshButton />
              {canDelete && !bl ? (
                <form action={deleteCommandeAction}>
                  <input type="hidden" name="commande_id" value={commande.id} />
                  <DeleteIconButton label="Supprimer" />
                </form>
              ) : null}
            </div>
          </div>
        </section>

        {avertissement ? (
          <div className="rounded-[1.75rem] border border-amber-200 bg-amber-50 px-6 py-4 text-sm font-semibold text-amber-800">
            {avertissement}
          </div>
        ) : null}

        <section className="overflow-hidden rounded-[1.75rem] border border-black/5 bg-white shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-50 text-slate-500">
              <tr>
                <th className="px-6 py-4 font-semibold">Article</th>
                <th className="px-6 py-4 font-semibold">Quantite demandee</th>
              </tr>
            </thead>
            <tbody>
              {lignesEnrichies.map((ligne) => (
                <tr key={ligne.id} className="border-t border-slate-100">
                  <td className="px-6 py-4 font-semibold text-slate-900">{ligne.nomArticle}</td>
                  <td className="px-6 py-4 text-slate-600">{ligne.quantite_demandee.toLocaleString("fr-FR")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="rounded-[1.75rem] border border-black/5 bg-white p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Bon de Livraison</p>
          {bl ? (
            <Link href={`/facturation/bl/${bl.id}`} className="mt-2 inline-block font-semibold text-sky-700 underline">
              Voir le BL
            </Link>
          ) : canCreateBl ? (
            <form action={createBonLivraisonAction} className="mt-3">
              <input type="hidden" name="commande_id" value={commande.id} />
              <button
                type="submit"
                className="rounded-full bg-sky-700 px-6 py-3 text-sm font-semibold text-white transition hover:bg-sky-600"
              >
                Creer le BL
              </button>
            </form>
          ) : (
            <p className="mt-2 text-sm text-slate-500">Pas encore de BL.</p>
          )}
        </section>
      </div>
    </main>
  );
}
