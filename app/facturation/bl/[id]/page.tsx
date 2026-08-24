import { notFound } from "next/navigation";
import Link from "next/link";
import { unstable_noStore as noStore } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import { canDeletePageUser, canWritePageUser, getCurrentStockUser } from "@/lib/stock-auth";
import { BackButton } from "@/app/_components/back-button";
import { RefreshButton } from "@/app/_components/refresh-button";
import { SimplePrintButton } from "@/app/_components/simple-print-button";
import { DeleteIconButton } from "@/app/_components/delete-icon-button";
import { SubmitButton } from "@/app/_components/submit-button";
import { formatDate } from "@/lib/format-date";
import { createFactureAction } from "../../facture/actions";
import {
  apurerBonLivraisonAction,
  calculerFifoBonLivraisonAction,
  deleteBonLivraisonAction,
  livrerBonLivraisonAction,
} from "../actions";

type BonLivraisonRow = {
  id: number;
  numero: number | null;
  date_jour: string;
  commande_id: number;
  statut: string;
  cree_par: string | null;
};
type LigneRow = { id: number; article_id: number; quantite_demandee: number };
type FifoRow = { article_id: number; numero_lot: string | null; quantite_chargee: number };

const STATUT_LABELS: Record<string, string> = {
  brouillon: "Brouillon",
  apure: "Apure",
  fifo_fait: "FIFO fait",
  livree: "Livree",
};

async function fetchNomArticle(articleId: number): Promise<string> {
  const { data } = await supabaseServer.from("articles").select("nom_article").eq("id", articleId).maybeSingle();
  return (data as { nom_article: string } | null)?.nom_article ?? `#${articleId}`;
}

export default async function BonLivraisonDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ avertissement?: string }>;
}) {
  noStore();
  const { id } = await params;
  const bonLivraisonId = Number(id);
  if (!bonLivraisonId) {
    notFound();
  }
  const { avertissement } = await searchParams;

  const currentUser = await getCurrentStockUser();
  const canWrite = await canWritePageUser(currentUser, "facturationBl");
  const canDelete = await canDeletePageUser(currentUser, "facturationBl");
  const canCreateFacture = await canWritePageUser(currentUser, "facturationFacture");

  const { data: blData } = await supabaseServer
    .from("bons_livraison")
    .select("id, numero, date_jour, commande_id, statut, cree_par")
    .eq("id", bonLivraisonId)
    .maybeSingle();

  const bl = blData as BonLivraisonRow | null;
  if (!bl) {
    notFound();
  }

  const [{ data: commandeData }, { data: lignesData }, { data: fifoData }, { data: factureData }] = await Promise.all([
    supabaseServer.from("facturation_commandes").select("id, client, depot_source_id").eq("id", bl.commande_id).maybeSingle(),
    supabaseServer
      .from("bon_livraison_lignes")
      .select("id, article_id, quantite_demandee")
      .eq("bon_livraison_id", bonLivraisonId)
      .order("id", { ascending: true }),
    supabaseServer.from("bl_fifo_resultats").select("article_id, numero_lot, quantite_chargee").eq("bon_livraison_id", bonLivraisonId),
    supabaseServer.from("factures").select("id").eq("bon_livraison_id", bonLivraisonId).maybeSingle(),
  ]);

  const commande = commandeData as { id: number; client: string; depot_source_id: number } | null;
  const facture = factureData as { id: number } | null;
  const { data: depotData } = commande
    ? await supabaseServer.from("depots").select("nom").eq("id", commande.depot_source_id).maybeSingle()
    : { data: null };
  const depotNom = (depotData as { nom: string } | null)?.nom ?? "-";

  const lignesEnrichies = await Promise.all(
    ((lignesData ?? []) as LigneRow[]).map(async (ligne) => ({ ...ligne, nomArticle: await fetchNomArticle(ligne.article_id) }))
  );
  const fifoRows = (fifoData ?? []) as FifoRow[];
  const fifoEnrichi = await Promise.all(
    fifoRows.map(async (row) => ({ ...row, nomArticle: await fetchNomArticle(row.article_id) }))
  );

  const code = `BL.${bl.date_jour.slice(0, 4)}.${bl.numero ?? bl.id}`;

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#edf8ff_0%,#f8fcff_48%,#ffffff_100%)] px-4 py-6 text-slate-900 lg:px-8">
      <div className="mx-auto w-full max-w-4xl space-y-6">
        <section className="rounded-[1.75rem] border border-black/5 bg-white p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.16em] text-sky-700">ERP Rodis</p>
              <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-900">{code}</h1>
              <p className="mt-2 text-sm text-slate-600">
                {formatDate(bl.date_jour)} - {commande?.client ?? "-"} - Depot {depotNom}
                {bl.cree_par ? ` - Cree par ${bl.cree_par}` : ""}
              </p>
              <span className="mt-2 inline-block rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
                {STATUT_LABELS[bl.statut] ?? bl.statut}
              </span>
            </div>

            <div className="no-print flex flex-wrap items-center gap-3">
              <BackButton href="/facturation/bl" label="Retour BL" />
              <RefreshButton />
              <SimplePrintButton />
              {canDelete && bl.statut === "brouillon" ? (
                <form action={deleteBonLivraisonAction}>
                  <input type="hidden" name="bon_livraison_id" value={bl.id} />
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

        {fifoEnrichi.length > 0 ? (
          <section className="overflow-hidden rounded-[1.75rem] border border-black/5 bg-white shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
            <p className="px-6 py-4 text-xs font-semibold uppercase tracking-wide text-slate-500">Dispatch FIFO</p>
            <table className="min-w-full text-left text-sm">
              <thead className="bg-slate-50 text-slate-500">
                <tr>
                  <th className="px-6 py-3 font-semibold">Article</th>
                  <th className="px-6 py-3 font-semibold">Lot</th>
                  <th className="px-6 py-3 font-semibold">Quantite chargee</th>
                </tr>
              </thead>
              <tbody>
                {fifoEnrichi.map((row, i) => (
                  <tr key={i} className="border-t border-slate-100">
                    <td className="px-6 py-3 font-semibold text-slate-900">{row.nomArticle}</td>
                    <td className="px-6 py-3 text-slate-600">{row.numero_lot || "-"}</td>
                    <td className="px-6 py-3 text-slate-600">{row.quantite_chargee.toLocaleString("fr-FR")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        ) : null}

        {canWrite ? (
          <section className="no-print rounded-[1.75rem] border border-black/5 bg-white p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Prochaine etape</p>
            <div className="mt-3">
              {bl.statut === "brouillon" ? (
                <form action={apurerBonLivraisonAction}>
                  <input type="hidden" name="bon_livraison_id" value={bl.id} />
                  <SubmitButton pendingLabel="Apurement..." className="rounded-full bg-sky-700 px-6 py-3 text-sm font-semibold text-white transition hover:bg-sky-600">
                    Apurer
                  </SubmitButton>
                </form>
              ) : bl.statut === "apure" ? (
                <form action={calculerFifoBonLivraisonAction}>
                  <input type="hidden" name="bon_livraison_id" value={bl.id} />
                  <SubmitButton pendingLabel="Calcul FIFO..." className="rounded-full bg-sky-700 px-6 py-3 text-sm font-semibold text-white transition hover:bg-sky-600">
                    Calculer FIFO
                  </SubmitButton>
                </form>
              ) : bl.statut === "fifo_fait" ? (
                <form action={livrerBonLivraisonAction}>
                  <input type="hidden" name="bon_livraison_id" value={bl.id} />
                  <SubmitButton pendingLabel="Livraison..." className="rounded-full bg-emerald-700 px-6 py-3 text-sm font-semibold text-white transition hover:bg-emerald-600">
                    Livrer (sort le stock)
                  </SubmitButton>
                </form>
              ) : (
                <p className="text-sm text-slate-500">Livre - stock sorti.</p>
              )}
            </div>
          </section>
        ) : null}

        {bl.statut === "livree" ? (
          <section className="no-print rounded-[1.75rem] border border-black/5 bg-white p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Facture</p>
            {facture ? (
              <Link href={`/facturation/facture/${facture.id}`} className="mt-2 inline-block font-semibold text-sky-700 underline">
                Voir la Facture
              </Link>
            ) : canCreateFacture ? (
              <form action={createFactureAction} className="mt-3 flex flex-wrap items-end gap-3">
                <input type="hidden" name="bon_livraison_id" value={bl.id} />
                <label className="grid gap-1 text-xs font-semibold text-slate-500">
                  Montant (optionnel)
                  <input
                    type="number"
                    step="0.01"
                    name="montant"
                    className="rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none"
                  />
                </label>
                <SubmitButton pendingLabel="Creation..." className="rounded-full bg-sky-700 px-6 py-3 text-sm font-semibold text-white transition hover:bg-sky-600">
                  Creer la Facture
                </SubmitButton>
              </form>
            ) : (
              <p className="mt-2 text-sm text-slate-500">Pas encore de Facture.</p>
            )}
          </section>
        ) : null}
      </div>
    </main>
  );
}
