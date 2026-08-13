import { notFound } from "next/navigation";
import { unstable_noStore as noStore } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import { canWritePageUser, getCurrentStockUser } from "@/lib/stock-auth";
import { BackButton } from "@/app/_components/back-button";
import { RefreshButton } from "@/app/_components/refresh-button";
import { formatDate } from "../../../../suivi/data";
import { vracLabelFromName } from "@/lib/gamme-families";
import { TestLaboForm } from "./test-labo-form";

type LigneInfo = {
  id: number;
  zone: string;
  chaine: string;
  produit: string | null;
  article_id: number | null;
  date_jour: string;
  numero_lot: string | null;
};

type RapportInfo = {
  ph: number | null;
  densite: number | null;
  viscosite: number | null;
  degre_alcool: number | null;
  stabilite: string | null;
  couleur: string | null;
  temperature_test: number | null;
  odeur: string | null;
  taux_humidite: number | null;
  pression_atmospherique: number | null;
  texture: string | null;
  remarque: string | null;
  disposition_qualite: string | null;
  sous_derogation: boolean | null;
  motif_derogation: string | null;
  nom_labo: string | null;
  date_prise_echantillon: string | null;
  heure_prise_echantillon: string | null;
  heure_debut_analyse: string | null;
  heure_fin_analyse: string | null;
  utilisateur_test_labo: string | null;
};

type SpecInfo = {
  ph_min: number | null;
  ph_max: number | null;
  viscosite_min: number | null;
  viscosite_max: number | null;
  densite_min: number | null;
  densite_max: number | null;
  degre_alcool_min: number | null;
  degre_alcool_max: number | null;
  taux_humidite_min: number | null;
  taux_humidite_max: number | null;
  pression_atmospherique_min: number | null;
  pression_atmospherique_max: number | null;
  texture: string | null;
  stabilite: string | null;
  couleur: string | null;
  temperature_min: number | null;
  temperature_max: number | null;
};

const RAPPORT_FIELDS =
  "ph, densite, viscosite, degre_alcool, stabilite, couleur, temperature_test, odeur, taux_humidite, pression_atmospherique, texture, remarque, disposition_qualite, sous_derogation, motif_derogation, nom_labo, date_prise_echantillon, heure_prise_echantillon, heure_debut_analyse, heure_fin_analyse, utilisateur_test_labo";

type SearchParams = Promise<{ code?: string; erreur?: string; enregistre?: string; ajuste?: string }>;

export default async function TestLaboPage({
  params,
  searchParams,
}: {
  params: Promise<{ ligneId: string }>;
  searchParams: SearchParams;
}) {
  noStore();
  const { ligneId } = await params;
  const ligneIdNumber = Number(ligneId);
  const { code: codeParam, erreur, enregistre, ajuste } = await searchParams;
  const code = (codeParam || "").trim();

  if (!ligneIdNumber) {
    notFound();
  }

  const currentStockUser = await getCurrentStockUser();
  const canWrite = await canWritePageUser(currentStockUser, "productionSuiviProductionFabrication");

  const [{ data: ligneData }, { data: rapportData }] = await Promise.all([
    supabaseServer
      .from("programme_lignes")
      .select("id, zone, chaine, produit, article_id, date_jour, numero_lot")
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

  // Meme repli que Fabrication : seulement pour une ligne jamais decoupee
  // en plusieurs lots, l'ancien rapport partage (code "") reste sans
  // ambiguite le bon prefill.
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

  // Spec labo = celle du vrac fabrique par cette ligne (meme resolution
  // article -> vrac_article_id que la credit de stock vrac en Fabrication).
  let spec: SpecInfo | null = null;
  if (ligne.article_id) {
    const { data: articleData } = await supabaseServer
      .from("articles")
      .select("vrac_article_id")
      .eq("id", ligne.article_id)
      .maybeSingle();
    const vracArticleId = (articleData as { vrac_article_id: number | null } | null)?.vrac_article_id ?? null;

    if (vracArticleId) {
      const { data: specData } = await supabaseServer
        .from("articles_specs_qualite")
        .select(
          "ph_min, ph_max, viscosite_min, viscosite_max, densite_min, densite_max, degre_alcool_min, degre_alcool_max, stabilite, couleur, taux_humidite_min, taux_humidite_max, pression_atmospherique_min, pression_atmospherique_max, texture, temperature_min, temperature_max"
        )
        .eq("article_id", vracArticleId)
        .maybeSingle();
      spec = specData as SpecInfo | null;
    }
  }

  // Liste complete des matieres premieres pour le picker d'ajustement -
  // PostgREST plafonne a 1000 lignes, pagine par securite meme si le
  // catalogue MP actuel tient largement dans une seule page.
  const mpArticles: { id: number; label: string }[] = [];
  let fromIndex = 0;
  const pageSize = 1000;
  while (true) {
    const { data: mpData, error: mpError } = await supabaseServer
      .from("articles_matiere_premiere")
      .select("id, nom_article")
      .order("nom_article", { ascending: true })
      .range(fromIndex, fromIndex + pageSize - 1);
    if (mpError) break;
    const chunk = (mpData as { id: number; nom_article: string }[] | null) ?? [];
    mpArticles.push(...chunk.map((a) => ({ id: a.id, label: a.nom_article })));
    if (chunk.length < pageSize) break;
    fromIndex += pageSize;
  }

  // L'ajustement matiere premiere sort toujours du Depot B (meme depot que
  // toute la consommation Fabrication) - transmis au formulaire pour lister
  // uniquement les lots reellement disponibles a cet endroit, au lieu de
  // laisser taper un numero de lot au hasard.
  const { data: depotBData } = await supabaseServer
    .from("depots")
    .select("id")
    .ilike("nom", "Depot B")
    .maybeSingle();
  const depotBId = (depotBData as { id: number } | null)?.id ?? null;

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#f6f0ff_0%,#faf8ff_48%,#ffffff_100%)] px-4 py-6 text-slate-900 lg:px-8">
      <div className="mx-auto w-full space-y-6">
        <section className="rounded-[1.75rem] border border-black/5 bg-white p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.16em] text-violet-700">
                ERP Rodis
              </p>
              <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-900">Test labo</h1>
              <p className="mt-2 text-sm text-slate-600">
                {formatDate(ligne.date_jour)} - {ligne.zone} / {ligne.chaine} -{" "}
                {vracLabelFromName(ligne.produit) || "-"}
                {code ? ` - Lot ${code}` : ligne.numero_lot ? ` - Lot ${ligne.numero_lot}` : ""}
              </p>
              {rapport?.utilisateur_test_labo ? (
                <p className="mt-1 text-xs text-slate-500">
                  {rapport.nom_labo || "Laboratoire Rodis"} - Derniere saisie par {rapport.utilisateur_test_labo}
                </p>
              ) : (
                <p className="mt-1 text-xs text-slate-500">Laboratoire Rodis</p>
              )}
              {!spec ? (
                <p className="mt-1 text-xs text-amber-600">
                  Aucune spec labo enregistree pour cet article (voir module Qualite).
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
        {enregistre ? (
          <div className="rounded-[1.75rem] border border-emerald-200 bg-emerald-50 px-6 py-4 text-sm font-semibold text-emerald-700">
            Test labo enregistre.
          </div>
        ) : null}
        {ajuste ? (
          <div className="rounded-[1.75rem] border border-emerald-200 bg-emerald-50 px-6 py-4 text-sm font-semibold text-emerald-700">
            Ajustement matiere premiere enregistre (sortie de stock reelle).
          </div>
        ) : null}

        <section className="rounded-[1.75rem] border border-black/5 bg-white p-6 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
          {!canWrite ? (
            <p className="rounded-2xl bg-slate-100 px-4 py-3 text-sm font-medium text-slate-600">
              Lecture seule : saisie de test labo cachee pour cet utilisateur.
            </p>
          ) : (
            <TestLaboForm
              ligneId={ligne.id}
              code={code}
              rapport={rapport}
              spec={spec}
              mpArticles={mpArticles}
              depotBId={depotBId}
            />
          )}
        </section>
      </div>
    </main>
  );
}
