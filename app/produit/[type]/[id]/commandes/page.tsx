import { notFound } from "next/navigation";
import Link from "next/link";
import { unstable_noStore as noStore } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import { computeStatutBc, statutBcBadgeClass } from "@/app/stock/matiere-premiere/bc/constants";
import { encodeDossierId } from "@/app/stock/matiere-premiere/commande/dossier-id";
import { formatDate } from "@/lib/format-date";

type BcLigneRow = {
  id: number;
  code: string;
  quantite: number | null;
  statut: string | null;
  date_jour: string | null;
  fournisseur: string | null;
};

type ImportEvenementRow = {
  bc_ligne_id: number;
  n_doss_4d_import: string | null;
  n_doss_erp_import: string | null;
  quantite_importee: number;
  lot_stock_id: number | null;
};

type DossierStatutRow = {
  n_doss_4d: string | null;
  n_doss_erp: string | null;
  statut: string | null;
  date_prevue_reception: string | null;
};

type DossierEnAttente = {
  nDoss4d: string | null;
  nDossErp: string | null;
  quantite: number;
  statut: string | null;
  datePrevueReception: string | null;
};

// Meme regroupement BC/Import que Stock Actuel MP (app/stock/matiere-
// premiere/stock-actuel/page.tsx), mais pour UN SEUL article (celui de
// cette page) au lieu de tous - avec en plus la date de commande et la
// date prevue de reception, absentes de la vue liste. Demande explicite :
// "si j'appuie sur un article ca va me sortir le stock et si ya BC ou
// import avec la qt et le date de commande et le prevu de receptioner".
export default async function ProduitCommandesPage({ params }: { params: Promise<{ type: string; id: string }> }) {
  noStore();
  const { type, id } = await params;
  if (type !== "mp") {
    notFound();
  }
  const articleId = Number(id);
  if (!articleId) {
    notFound();
  }

  const { data: bcLignesData } = await supabaseServer
    .from("bons_commande_matiere_premiere")
    .select("id, code, quantite, statut, date_jour, fournisseur")
    .eq("article_id", articleId)
    .order("date_jour", { ascending: false });
  const bcLignes = (bcLignesData ?? []) as BcLigneRow[];
  const bcLigneIds = bcLignes.map((l) => l.id);

  const { data: importsData } = await supabaseServer
    .from("bons_commande_mp_imports")
    .select("bc_ligne_id, n_doss_4d_import, n_doss_erp_import, quantite_importee, lot_stock_id")
    .in("bc_ligne_id", bcLigneIds.length > 0 ? bcLigneIds : [0]);
  const imports = (importsData ?? []) as ImportEvenementRow[];

  const { data: dossierStatutsData } = await supabaseServer
    .from("dossiers_import_mp_statut")
    .select("n_doss_4d, n_doss_erp, statut, date_prevue_reception");
  const dossierStatuts = (dossierStatutsData ?? []) as DossierStatutRow[];
  const dossierStatutByKey = new Map(
    dossierStatuts.map((d) => [`${d.n_doss_4d ?? ""}|||${d.n_doss_erp ?? ""}`, d])
  );

  // Quantite importee TOTALE (recue ou pas) par ligne BC - sert au statut
  // (computeStatutBc), pas a l'affichage "en transit" (voir plus bas).
  const quantiteImporteeTotaleByLigneId = new Map<number, number>();
  // Quantite REELLEMENT recue (lot_stock_id pose = credite en stock).
  const quantiteRecueByLigneId = new Map<number, number>();
  // Dossiers pas encore receptionnes (lot_stock_id null) par ligne BC.
  const dossiersEnAttenteByLigneId = new Map<number, Map<string, DossierEnAttente>>();

  for (const evt of imports) {
    const qte = Number(evt.quantite_importee ?? 0);
    quantiteImporteeTotaleByLigneId.set(evt.bc_ligne_id, (quantiteImporteeTotaleByLigneId.get(evt.bc_ligne_id) ?? 0) + qte);

    if (evt.lot_stock_id !== null) {
      quantiteRecueByLigneId.set(evt.bc_ligne_id, (quantiteRecueByLigneId.get(evt.bc_ligne_id) ?? 0) + qte);
      continue;
    }

    const key = `${evt.n_doss_4d_import ?? ""}|||${evt.n_doss_erp_import ?? ""}`;
    const dossierStatut = dossierStatutByKey.get(key);
    const map = dossiersEnAttenteByLigneId.get(evt.bc_ligne_id) ?? new Map<string, DossierEnAttente>();
    const existing = map.get(key);
    map.set(key, {
      nDoss4d: evt.n_doss_4d_import,
      nDossErp: evt.n_doss_erp_import,
      quantite: (existing?.quantite ?? 0) + qte,
      statut: dossierStatut?.statut ?? null,
      datePrevueReception: dossierStatut?.date_prevue_reception ?? null,
    });
    dossiersEnAttenteByLigneId.set(evt.bc_ligne_id, map);
  }

  const lignesEnrichies = bcLignes
    .map((ligne) => {
      const quantite = Number(ligne.quantite ?? 0);
      const quantiteImporteeTotale = quantiteImporteeTotaleByLigneId.get(ligne.id) ?? 0;
      const quantiteRecue = quantiteRecueByLigneId.get(ligne.id) ?? 0;
      return {
        ...ligne,
        quantite,
        quantiteRecue,
        resteARecevoir: Math.max(0, quantite - quantiteRecue),
        statutCalcule: computeStatutBc(quantite, quantiteImporteeTotale, ligne.statut),
        dossiersEnAttente: [...(dossiersEnAttenteByLigneId.get(ligne.id)?.values() ?? [])],
      };
    })
    // Ne garde que les BC pas encore entierement termines - un BC clos
    // n'est plus "en cours", pas la peine de l'afficher ici indefiniment.
    .filter((ligne) => ligne.statutCalcule !== "Termine");

  return (
    <section className="overflow-hidden rounded-[1.75rem] border border-black/5 bg-white shadow-[0_18px_50px_rgba(15,23,42,0.08)]">
      {lignesEnrichies.length === 0 ? (
        <p className="px-6 py-8 text-sm text-slate-500">Aucune commande (BC) en cours pour cet article.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-50 text-slate-500">
              <tr>
                <th className="px-6 py-4 font-semibold">BC</th>
                <th className="px-6 py-4 font-semibold">Date commande</th>
                <th className="px-6 py-4 font-semibold">Fournisseur</th>
                <th className="px-6 py-4 font-semibold">Statut</th>
                <th className="px-6 py-4 font-semibold">Quantite commandee</th>
                <th className="px-6 py-4 font-semibold">Reste a recevoir</th>
                <th className="px-6 py-4 font-semibold">Import(s) en transit</th>
              </tr>
            </thead>
            <tbody>
              {lignesEnrichies.map((ligne) => (
                <tr key={ligne.id} className="border-t border-slate-100 align-top">
                  <td className="px-6 py-4 font-semibold text-slate-900">
                    <Link href={`/stock/matiere-premiere/bc/${ligne.code}`} className="text-sky-700 underline">
                      {ligne.code}
                    </Link>
                  </td>
                  <td className="px-6 py-4 text-slate-600">{formatDate(ligne.date_jour)}</td>
                  <td className="px-6 py-4 text-slate-600">{ligne.fournisseur || "-"}</td>
                  <td className="px-6 py-4">
                    <span className={`rounded-full px-3 py-1 text-xs font-semibold ${statutBcBadgeClass(ligne.statutCalcule)}`}>
                      {ligne.statutCalcule}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-slate-600">{ligne.quantite.toLocaleString("fr-FR")}</td>
                  <td className="px-6 py-4 font-semibold text-slate-900">{ligne.resteARecevoir.toLocaleString("fr-FR")}</td>
                  <td className="px-6 py-4">
                    {ligne.dossiersEnAttente.length === 0 ? (
                      <span className="text-xs text-slate-400">Aucun import en cours</span>
                    ) : (
                      <ul className="space-y-1.5">
                        {ligne.dossiersEnAttente.map((dossier, i) => (
                          <li key={i} className="rounded-xl bg-slate-50 px-3 py-2 text-xs">
                            <Link
                              href={`/stock/matiere-premiere/commande/${encodeDossierId(dossier.nDoss4d, dossier.nDossErp)}`}
                              className="font-semibold text-sky-700 underline"
                            >
                              4D: {dossier.nDoss4d || "-"} / ERP: {dossier.nDossErp || "-"}
                            </Link>
                            <p className="mt-0.5 text-slate-600">
                              Qte: {dossier.quantite.toLocaleString("fr-FR")}
                              {dossier.statut ? ` - ${dossier.statut}` : ""}
                            </p>
                            <p className="text-slate-500">
                              Reception prevue :{" "}
                              {dossier.datePrevueReception ? formatDate(dossier.datePrevueReception) : "non renseignee"}
                            </p>
                          </li>
                        ))}
                      </ul>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
