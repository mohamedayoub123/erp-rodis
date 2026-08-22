"use server";

import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import { canWritePageUser, getCurrentStockUser } from "@/lib/stock-auth";
import { recalculerEcritureFabricationVrac } from "@/app/production/suivi-production/actions";
import { recalculerEcritureEntreeProduction } from "@/app/mouvements/produit-fini/entree-production/actions";
import { recalculerEcritureAchatMp } from "@/app/stock/matiere-premiere/commande/actions";
import { creerEcritureVente } from "@/app/commandes/actions";

const CONCURRENCE = 5;

async function requireAccess() {
  const currentUser = await getCurrentStockUser();
  if (!(await canWritePageUser(currentUser, "comptabilite"))) {
    throw new Error("Cet utilisateur ne peut pas reconstituer la comptabilite.");
  }
  return currentUser;
}

async function traiterAvecConcurrence<T>(items: T[], run: (item: T) => Promise<void>) {
  let index = 0;
  async function worker() {
    while (index < items.length) {
      const item = items[index];
      index += 1;
      await run(item);
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCE, items.length) }, worker));
}

// Reconstitue les ecritures "fabrication_vrac" manquantes - en mode strict
// (requireTrace) : seuls les codes avec une reservation MP reellement tracee
// (production_mp_reserve, meme apres consommation complete) recoivent une
// ecriture. Un code sans trace (production trop ancienne, avant la mise en
// place du suivi par lot) reste silencieusement sans ecriture pour toujours
// - jamais un cout invente/approxime - demande explicite de l'utilisateur.
export async function backfillFabricationAction(_formData: FormData): Promise<void> {
  const currentUser = await requireAccess();

  const { data: rapportsData } = await supabaseServer
    .from("production_rapports")
    .select("programme_ligne_id, code")
    .gt("vrac_fabrique", 0);
  const cibles = ((rapportsData ?? []) as { programme_ligne_id: number; code: string }[]).map((r) => ({
    ligneId: r.programme_ligne_id,
    code: r.code,
  }));

  const { data: existantesData } = await supabaseServer
    .from("ecritures_comptables")
    .select("source_id")
    .eq("source_type", "fabrication_vrac");
  const dejaFait = new Set(((existantesData ?? []) as { source_id: string }[]).map((e) => e.source_id));

  const aTraiter = cibles.filter((c) => !dejaFait.has(`${c.ligneId}-${c.code}`));

  await traiterAvecConcurrence(aTraiter, async ({ ligneId, code }) => {
    try {
      await recalculerEcritureFabricationVrac(ligneId, code, currentUser, { requireTrace: true });
    } catch (error) {
      console.error(`Backfill fabrication_vrac echoue (${ligneId}-${code}):`, error);
    }
  });

  revalidatePath("/comptabilite/backfill");
  revalidatePath("/comptabilite/balance");
  revalidatePath("/comptabilite/journal");
}

// Reconstitue les ecritures "entree_production" manquantes - meme principe
// strict (requireTrace) que backfillFabricationAction.
export async function backfillEntreeProductionAction(_formData: FormData): Promise<void> {
  const currentUser = await requireAccess();

  const { data: lotsData } = await supabaseServer
    .from("lots_stock")
    .select("mouvement_groupe_id, article_id")
    .eq("source_import", "web:entree-production");
  const pairesSet = new Set<string>();
  for (const row of (lotsData as { mouvement_groupe_id: number | null; article_id: number | null }[] | null) ?? []) {
    if (!row.mouvement_groupe_id || !row.article_id) continue;
    pairesSet.add(`${row.mouvement_groupe_id}::${row.article_id}`);
  }
  const cibles = [...pairesSet].map((key) => {
    const [groupeId, articleId] = key.split("::").map(Number);
    return { groupeId, articleId };
  });

  const { data: existantesData } = await supabaseServer
    .from("ecritures_comptables")
    .select("source_id")
    .eq("source_type", "entree_production");
  const dejaFait = new Set(((existantesData ?? []) as { source_id: string }[]).map((e) => e.source_id));

  const aTraiter = cibles.filter((c) => !dejaFait.has(`${c.groupeId}-${c.articleId}`));

  await traiterAvecConcurrence(aTraiter, async ({ groupeId, articleId }) => {
    try {
      await recalculerEcritureEntreeProduction(groupeId, articleId, currentUser, { requireTrace: true });
    } catch (error) {
      console.error(`Backfill entree_production echoue (${groupeId}-${articleId}):`, error);
    }
  });

  revalidatePath("/comptabilite/backfill");
  revalidatePath("/comptabilite/balance");
  revalidatePath("/comptabilite/journal");
}

// Reconstitue les ecritures "mp_achat"/"mp_stock_entree" manquantes - la
// SEULE des 4 categories ou la donnee source (prix + lot reellement recu)
// est toujours complete et certaine (c'est la reception elle-meme), jamais
// une estimation : traite donc TOUJOURS tous les lots avec un prix connu,
// sans mode strict separe.
export async function backfillAchatsMpAction(_formData: FormData): Promise<void> {
  const currentUser = await requireAccess();

  const { data: lotsData } = await supabaseServer
    .from("lots_stock_matiere_premiere")
    .select("id")
    .gt("qte_entree", 0)
    .not("prix_unitaire", "is", null)
    .gt("prix_unitaire", 0);
  const lotIds = ((lotsData ?? []) as { id: number }[]).map((r) => r.id);

  const { data: existantesData } = await supabaseServer
    .from("ecritures_comptables")
    .select("source_id")
    .eq("source_type", "mp_achat");
  const dejaFait = new Set(((existantesData ?? []) as { source_id: string }[]).map((e) => e.source_id));

  const aTraiter = lotIds.filter((id) => !dejaFait.has(String(id)));

  await traiterAvecConcurrence(aTraiter, async (lotId) => {
    try {
      await recalculerEcritureAchatMp(lotId, currentUser);
    } catch (error) {
      console.error(`Backfill mp_achat echoue (lot ${lotId}):`, error);
    }
  });

  revalidatePath("/comptabilite/backfill");
  revalidatePath("/comptabilite/balance");
  revalidatePath("/comptabilite/journal");
}

// Reconstitue les ecritures de vente (commande_vente/commande_cout_vente) -
// utilise le cout par recette/FEFO actuel (meme methode qu'a la livraison en
// temps reel), pas de mode strict ici : la tracabilite par lot PF vendu est
// une amelioration separee, non demandee pour cette reconstitution.
export async function backfillCommandesAction(_formData: FormData): Promise<void> {
  const currentUser = await requireAccess();

  const { data: fifoData } = await supabaseServer.from("fifo_resultats").select("commande_id");
  const commandeIds = [
    ...new Set(((fifoData ?? []) as { commande_id: number | null }[]).map((r) => r.commande_id).filter(Boolean)),
  ] as number[];

  const { data: existantesData } = await supabaseServer
    .from("ecritures_comptables")
    .select("source_id")
    .eq("source_type", "commande_cout_vente");
  const dejaFait = new Set(((existantesData ?? []) as { source_id: string }[]).map((e) => e.source_id));

  const aTraiter = commandeIds.filter((id) => !dejaFait.has(String(id)));

  await traiterAvecConcurrence(aTraiter, async (commandeId) => {
    try {
      await creerEcritureVente(commandeId, currentUser);
    } catch (error) {
      console.error(`Backfill commande echoue (${commandeId}):`, error);
    }
  });

  revalidatePath("/comptabilite/backfill");
  revalidatePath("/comptabilite/balance");
  revalidatePath("/comptabilite/journal");
}

export async function fetchBackfillCounts() {
  await requireAccess();

  const [
    { data: rapportsData },
    { data: fabExistantes },
    { data: lotsData },
    { data: entreeExistantes },
    { count: achatsTotal },
    { data: achatsExistantes },
    { data: fifoData },
    { data: commandesExistantes },
  ] = await Promise.all([
    supabaseServer.from("production_rapports").select("programme_ligne_id, code").gt("vrac_fabrique", 0),
    supabaseServer.from("ecritures_comptables").select("source_id").eq("source_type", "fabrication_vrac"),
    supabaseServer.from("lots_stock").select("mouvement_groupe_id, article_id").eq("source_import", "web:entree-production"),
    supabaseServer.from("ecritures_comptables").select("source_id").eq("source_type", "entree_production"),
    supabaseServer
      .from("lots_stock_matiere_premiere")
      .select("id", { count: "exact", head: true })
      .gt("qte_entree", 0)
      .not("prix_unitaire", "is", null)
      .gt("prix_unitaire", 0),
    supabaseServer.from("ecritures_comptables").select("source_id").eq("source_type", "mp_achat"),
    supabaseServer.from("fifo_resultats").select("commande_id"),
    supabaseServer.from("ecritures_comptables").select("source_id").eq("source_type", "commande_cout_vente"),
  ]);

  const fabCibles = ((rapportsData ?? []) as { programme_ligne_id: number; code: string }[]).map(
    (r) => `${r.programme_ligne_id}-${r.code}`
  );
  const fabFait = new Set(((fabExistantes ?? []) as { source_id: string }[]).map((e) => e.source_id));

  const entreePairesSet = new Set<string>();
  for (const row of (lotsData as { mouvement_groupe_id: number | null; article_id: number | null }[] | null) ?? []) {
    if (!row.mouvement_groupe_id || !row.article_id) continue;
    entreePairesSet.add(`${row.mouvement_groupe_id}-${row.article_id}`);
  }
  const entreeFait = new Set(((entreeExistantes ?? []) as { source_id: string }[]).map((e) => e.source_id));

  const achatsFait = new Set(((achatsExistantes ?? []) as { source_id: string }[]).map((e) => e.source_id));

  const commandesTotal = new Set(
    ((fifoData ?? []) as { commande_id: number | null }[]).map((r) => r.commande_id).filter(Boolean)
  ).size;
  const commandesFait = new Set(((commandesExistantes ?? []) as { source_id: string }[]).map((e) => e.source_id))
    .size;

  return {
    fabricationTotal: fabCibles.length,
    fabricationAvecEcriture: fabCibles.filter((id) => fabFait.has(id)).length,
    entreeProductionTotal: entreePairesSet.size,
    entreeProductionAvecEcriture: [...entreePairesSet].filter((id) => entreeFait.has(id)).length,
    achatsMpTotal: achatsTotal ?? 0,
    achatsMpAvecEcriture: achatsFait.size,
    commandesTotal,
    commandesAvecEcriture: commandesFait,
  };
}
