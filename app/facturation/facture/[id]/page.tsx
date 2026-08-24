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
import { deleteFactureAction, updateFactureAction } from "../actions";

type FactureRow = {
  id: number;
  numero: number | null;
  date_jour: string;
  bon_livraison_id: number;
  montant: number | null;
  remarque: string | null;
  cree_par: string | null;
};

type LigneRow = { id: number; article_id: number; numero_lot: string | null; quantite: number };

async function fetchNomArticle(articleId: number): Promise<string> {
  const { data } = await supabaseServer.from("articles").select("nom_article").eq("id", articleId).maybeSingle();
  return (data as { nom_article: string } | null)?.nom_article ?? `#${articleId}`;
}

export default async function FactureDetailPage({ params }: { params: Promise<{ id: string }> }) {
  noStore();
  const { id } = await params;
  const factureId = Number(id);
  if (!factureId) {
    notFound();
  }

  const currentUser = await getCurrentStockUser();
  const canEdit = await canWritePageUser(currentUser, "facturationFacture");
  const canDelete = await canDeletePageUser(currentUser, "facturationFacture");

  const { data: factureData } = await supabaseServer
    .from("factures")
    .select("id, numero, date_jour, bon_livraison_id, montant, remarque, cree_par")
    .eq("id", factureId)
    .maybeSingle();

  const facture = factureData as FactureRow | null;
  if (!facture) {
    notFound();
  }

  const [{ data: blData }, { data: lignesData }] = await Promise.all([
    supabaseServer
      .from("bons_livraison")
      .select("id, numero, date_jour, commande_id")
      .eq("id", facture.bon_livraison_id)
      .maybeSingle(),
    supabaseServer
      .from("bon_livraison_lignes")
      .select("id, article_id, numero_lot, quantite")
      .eq("bon_livraison_id", facture.bon_livraison_id)
      .order("id", { ascending: true }),
  ]);

  const bl = blData as { id: number; numero: number | null; date_jour: string; commande_id: number } | null;
  const blCode = bl ? `BL.${bl.date_jour.slice(0, 4)}.${bl.numero ?? bl.id}` : null;

  const [{ data: commandeData }, lignesEnrichies] = await Promise.all([
    bl
      ? supabaseServer.from("commandes").select("id, numero_proforma, client").eq("id", bl.commande_id).maybeSingle()
      : Promise.resolve({ data: null }),
    Promise.all(
      ((lignesData ?? []) as LigneRow[]).map(async (ligne) => ({
        ...ligne,
        nomArticle: await fetchNomArticle(ligne.article_id),
      }))
    ),
  ]);

  const commande = commandeData as { id: number; numero_proforma: string; client: string } | null;
  const code = `FAC.${facture.date_jour.slice(0, 4)}.${facture.numero ?? facture.id}`;

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#edf8ff_0%,#f8fcff_48%,#ffffff_100%)] px-4 py-6 text-slate-900 lg:px-8">
      <div className="mx-auto w-full max-w-4xl space-y-6">
        <section className="rounded-[1.75rem] border border-black/5 bg-white p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.16em] text-sky-700">ERP Rodis</p>
              <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-900">{code}</h1>
              <p className="mt-2 text-sm text-slate-600">
                {formatDate(facture.date_jour)} - {commande ? `${commande.numero_proforma} - ${commande.client}` : "-"}
                {facture.cree_par ? ` - Cree par ${facture.cree_par}` : ""}
              </p>
              {blCode && bl ? (
                <p className="mt-1 text-sm">
                  Depuis{" "}
                  <Link href={`/facturation/bl/${bl.id}`} className="font-semibold text-sky-700 underline">
                    {blCode}
                  </Link>
                </p>
              ) : null}
            </div>

            <div className="no-print flex flex-wrap items-center gap-3">
              <BackButton href="/facturation/facture" label="Retour Facture" />
              <RefreshButton />
              <SimplePrintButton />
              {canDelete ? (
                <form action={deleteFactureAction}>
                  <input type="hidden" name="facture_id" value={facture.id} />
                  <DeleteIconButton label="Supprimer" />
                </form>
              ) : null}
            </div>
          </div>
        </section>

        <section className="overflow-hidden rounded-[1.75rem] border border-black/5 bg-white shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-50 text-slate-500">
              <tr>
                <th className="px-6 py-4 font-semibold">Article</th>
                <th className="px-6 py-4 font-semibold">Lot</th>
                <th className="px-6 py-4 font-semibold">Quantite</th>
              </tr>
            </thead>
            <tbody>
              {lignesEnrichies.map((ligne) => (
                <tr key={ligne.id} className="border-t border-slate-100">
                  <td className="px-6 py-4 font-semibold text-slate-900">{ligne.nomArticle}</td>
                  <td className="px-6 py-4 text-slate-600">{ligne.numero_lot || "-"}</td>
                  <td className="px-6 py-4 text-slate-600">{ligne.quantite.toLocaleString("fr-FR")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        {canEdit ? (
          <section className="no-print rounded-[1.75rem] border border-black/5 bg-white p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
            <form action={updateFactureAction} className="grid gap-4 sm:grid-cols-[auto_1fr_auto] sm:items-end">
              <input type="hidden" name="facture_id" value={facture.id} />
              <label className="grid gap-1 text-xs font-semibold text-slate-500">
                Montant
                <input
                  type="number"
                  step="0.01"
                  name="montant"
                  defaultValue={facture.montant ?? ""}
                  className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-normal text-slate-900 outline-none"
                />
              </label>
              <label className="grid gap-1 text-xs font-semibold text-slate-500">
                Remarque
                <input
                  type="text"
                  name="remarque"
                  defaultValue={facture.remarque || ""}
                  className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-normal text-slate-900 outline-none"
                />
              </label>
              <SubmitButton
                pendingLabel="Enregistrement..."
                className="rounded-full bg-slate-950 px-6 py-3 text-sm font-semibold text-white"
              >
                Enregistrer
              </SubmitButton>
            </form>
          </section>
        ) : facture.montant !== null ? (
          <section className="rounded-[1.75rem] border border-black/5 bg-white p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Montant</p>
            <p className="mt-1 text-lg font-bold text-slate-900">{facture.montant.toLocaleString("fr-FR")}</p>
          </section>
        ) : null}
      </div>
    </main>
  );
}
