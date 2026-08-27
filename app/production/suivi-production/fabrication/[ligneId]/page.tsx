import { notFound } from "next/navigation";
import Link from "next/link";
import { unstable_noStore as noStore } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import { canWritePageUser, getCurrentStockUser } from "@/lib/stock-auth";
import { BackButton } from "@/app/_components/back-button";
import { RefreshButton } from "@/app/_components/refresh-button";
import { formatDate } from "../../../suivi/data";
import { formatDateTime } from "@/lib/format-date";
import { vracLabelFromName } from "@/lib/gamme-families";
import { FabricationForm } from "./fabrication-form";
import { messageSiTestLaboInvalide } from "../../actions";
import { fetchLotsInDepot } from "@/app/depots/transfer-order/stock-lots";
import { fetchMachinesByType } from "@/lib/machines-by-type";

type LigneInfo = {
  id: number;
  zone: string;
  chaine: string;
  produit: string | null;
  date_jour: string;
  numero_lot: string | null;
  article_id: number | null;
};

type RapportInfo = {
  machine: string | null;
  type_fabrication: string | null;
  preparateur: string | null;
  cuve_1_numero: string | null;
  cuve_1_poids: number | null;
  cuve_2_numero: string | null;
  cuve_2_poids: number | null;
  cuve_3_numero: string | null;
  cuve_3_poids: number | null;
  cuve_4_numero: string | null;
  cuve_4_poids: number | null;
  nb_journaliers_fabrication: number | null;
  temps_debut_preparation: string | null;
  temps_envoi_echantillon_labo: string | null;
  temps_fin_test: string | null;
  temps_vidange: string | null;
  vrac_fabrique: number | null;
  qt_vrac_recupere: number | null;
  code_vrac_recupere: string | null;
  fabrication_arret_absence_air: number | null;
  fabrication_arret_absence_vapeur: number | null;
  fabrication_arret_attente_aspiration_aqueuse: number | null;
  fabrication_arret_attente_cuves_mobiles: number | null;
  fabrication_arret_attente_eau_osmosee: number | null;
  fabrication_arret_coupure_electrique: number | null;
  fabrication_arret_maintenance_plateforme: number | null;
  fabrication_arret_manque_cuves_mobiles: number | null;
  fabrication_arret_probleme_pompe: number | null;
  fabrication_arret_probleme_ph: number | null;
  fabrication_arret_probleme_technique: number | null;
  date_fabrication_conditionnement: string | null;
  utilisateur_fabrication: string | null;
  date_saisie_fabrication: string | null;
};

type SearchParams = Promise<{ code?: string; erreur?: string }>;

export default async function RapportFabricationPage({
  params,
  searchParams,
}: {
  params: Promise<{ ligneId: string }>;
  searchParams: SearchParams;
}) {
  noStore();
  const { ligneId } = await params;
  const ligneIdNumber = Number(ligneId);
  const { code: codeParam, erreur } = await searchParams;
  // Comme Conditionnement/Emballage : code du lot precis pour cette saisie
  // (ex: "AA4141V" parmi les 3 codes d'une ligne decoupee en plusieurs lots)
  // - vide seulement pour un lien genere avant l'ajout du suivi par code.
  const code = (codeParam || "").trim();

  if (!ligneIdNumber) {
    notFound();
  }

  const currentStockUser = await getCurrentStockUser();
  const canWrite = await canWritePageUser(currentStockUser, "productionSuiviProductionFabrication");

  const RAPPORT_FIELDS =
    "machine, type_fabrication, preparateur, cuve_1_numero, cuve_1_poids, cuve_2_numero, cuve_2_poids, cuve_3_numero, cuve_3_poids, cuve_4_numero, cuve_4_poids, nb_journaliers_fabrication, temps_debut_preparation, temps_envoi_echantillon_labo, temps_fin_test, temps_vidange, vrac_fabrique, qt_vrac_recupere, code_vrac_recupere, fabrication_arret_absence_air, fabrication_arret_absence_vapeur, fabrication_arret_attente_aspiration_aqueuse, fabrication_arret_attente_cuves_mobiles, fabrication_arret_attente_eau_osmosee, fabrication_arret_coupure_electrique, fabrication_arret_maintenance_plateforme, fabrication_arret_manque_cuves_mobiles, fabrication_arret_probleme_pompe, fabrication_arret_probleme_ph, fabrication_arret_probleme_technique, date_fabrication_conditionnement, utilisateur_fabrication, date_saisie_fabrication";

  const [{ data: ligneData }, { data: rapportData }] = await Promise.all([
    supabaseServer
      .from("programme_lignes")
      .select("id, zone, chaine, produit, date_jour, numero_lot, article_id")
      .eq("id", ligneIdNumber)
      .maybeSingle(),
    supabaseServer
      .from("production_rapports")
      .select(RAPPORT_FIELDS)
      .eq("programme_ligne_id", ligneIdNumber)
      .eq("code", code)
      .maybeSingle(),
  ]);

  const ligne = ligneData as LigneInfo | null;
  let rapport = rapportData as RapportInfo | null;

  // Meme repli que Conditionnement/Emballage : seulement pour une ligne
  // jamais decoupee en plusieurs lots, l'ancien rapport partage (code "")
  // reste sans ambiguite le bon prefill.
  if (!rapport && code) {
    const numeroLotCodes = (ligne?.numero_lot || "").split(",").map((c) => c.trim()).filter(Boolean);
    if (numeroLotCodes.length <= 1) {
      const { data: legacyRapport } = await supabaseServer
        .from("production_rapports")
        .select(RAPPORT_FIELDS)
        .eq("programme_ligne_id", ligneIdNumber)
        .eq("code", "")
        .maybeSingle();
      rapport = legacyRapport as RapportInfo | null;
    }
  }

  if (!ligne) {
    notFound();
  }

  const erreurTestLabo = await messageSiTestLaboInvalide(ligne.id, code);

  // Lots de vrac deja au Depot B (ex: credites via Test labo "A recuperer")
  // pour l'article vrac de cette ligne - le "Code vrac recupere" doit venir
  // de la, jamais tape librement, pour que la quantite mixee dans un
  // nouveau batch puisse etre reellement deduite du bon lot.
  let vracRecupereLots: { numeroLot: string; solde: number }[] = [];
  if (ligne.article_id) {
    const { data: articleData } = await supabaseServer
      .from("articles")
      .select("vrac_article_id")
      .eq("id", ligne.article_id)
      .maybeSingle();
    const vracArticleId = (articleData as { vrac_article_id: number | null } | null)?.vrac_article_id ?? null;

    const { data: depotBData } = await supabaseServer.from("depots").select("id").ilike("nom", "Depot B").maybeSingle();
    const depotBId = (depotBData as { id: number } | null)?.id ?? null;

    if (vracArticleId && depotBId) {
      vracRecupereLots = await fetchLotsInDepot("PF", vracArticleId, depotBId);
    }
  }

  const machines = await fetchMachinesByType("Fabrication");

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#edf8ff_0%,#f8fcff_48%,#ffffff_100%)] px-4 py-6 text-slate-900 lg:px-8">
      <div className="mx-auto w-full space-y-6">
        <section className="rounded-[1.75rem] border border-black/5 bg-white p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.16em] text-sky-700">
                ERP Rodis
              </p>
              <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-900">
                Rapport Fabrication
              </h1>
              <p className="mt-2 text-sm text-slate-600">
                {formatDate(ligne.date_jour)} - {ligne.zone} / {ligne.chaine} -{" "}
                {vracLabelFromName(ligne.produit) || "-"}
                {code ? ` - Lot ${code}` : ligne.numero_lot ? ` - Lot ${ligne.numero_lot}` : ""}
              </p>
              {rapport?.utilisateur_fabrication ? (
                <p className="mt-1 text-xs text-slate-500">
                  Derniere saisie par {rapport.utilisateur_fabrication}
                  {rapport.date_saisie_fabrication
                    ? ` (${formatDateTime(rapport.date_saisie_fabrication)})`
                    : ""}
                </p>
              ) : null}
            </div>

            <div className="flex items-center gap-3">
              <BackButton href="/production/suivi/dashboard" label="Retour dashboard" />
              <RefreshButton />
            </div>
          </div>
        </section>

        {erreur ? (
          <div className="rounded-[1.75rem] border border-red-200 bg-red-50 px-6 py-4 text-sm font-semibold text-red-700">
            {erreur}
          </div>
        ) : null}

        <section className="rounded-[1.75rem] border border-black/5 bg-white p-6 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
          {!canWrite ? (
            <p className="rounded-2xl bg-slate-100 px-4 py-3 text-sm font-medium text-slate-600">
              Lecture seule : saisie de rapport cachee pour cet utilisateur.
            </p>
          ) : erreurTestLabo ? (
            <div className="flex flex-col items-start gap-3 rounded-2xl bg-violet-50 px-4 py-4 text-sm font-medium text-violet-800">
              <p>{erreurTestLabo}</p>
              <Link
                href={`/production/suivi-production/fabrication/${ligne.id}/test-labo?code=${encodeURIComponent(code)}`}
                className="rounded-full bg-violet-700 px-4 py-2 text-xs font-semibold text-white"
              >
                Aller au Test labo
              </Link>
            </div>
          ) : (
            <FabricationForm
              ligneId={ligne.id}
              code={code}
              rapport={rapport}
              vracRecupereLots={vracRecupereLots}
              machines={machines}
              ligneDateJour={ligne.date_jour}
            />
          )}
        </section>
      </div>
    </main>
  );
}
