"use server";

import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import { canWritePageUser, getCurrentStockUser } from "@/lib/stock-auth";
import { logAudit } from "@/lib/audit-log";

// Tolerance flottante pour comparer un comptage physique au stock systeme -
// jamais une egalite stricte (quantites avec decimales).
const EPSILON = 0.01;
const TAILLE_LOT_MIN = 1;
const TAILLE_LOT_MAX = 200;

type LotBalanceRow = { article_id: number; numero_lot: string; stock: number };
type MovementCountRow = { article_id: number; mouvement_count: number };
type LigneRow = {
  id: number;
  stock_systeme: number;
  compte_1: number | null;
  compte_2: number | null;
  compte_3: number | null;
  nombre_comptages: number;
  statut: string;
};

async function requireInventaireWrite() {
  const currentUser = await getCurrentStockUser();
  if (!(await canWritePageUser(currentUser, "inventaireMp"))) {
    throw new Error("Cet utilisateur ne peut pas gerer l'inventaire MP.");
  }
  return currentUser;
}

async function fetchAllLotBalances(): Promise<LotBalanceRow[]> {
  const rows: LotBalanceRow[] = [];
  let from = 0;
  const pageSize = 1000;
  for (;;) {
    const { data, error } = await supabaseServer.rpc("stock_mp_lot_balances").range(from, from + pageSize - 1);
    if (error) throw new Error(error.message);
    const chunk = (data ?? []) as LotBalanceRow[];
    rows.push(...chunk);
    if (chunk.length < pageSize) break;
    from += pageSize;
  }
  return rows;
}

async function fetchMovementCounts(): Promise<Map<number, number>> {
  const rows: MovementCountRow[] = [];
  let from = 0;
  const pageSize = 1000;
  for (;;) {
    const { data, error } = await supabaseServer.rpc("mp_movement_counts").range(from, from + pageSize - 1);
    if (error) throw new Error(error.message);
    const chunk = (data ?? []) as MovementCountRow[];
    rows.push(...chunk);
    if (chunk.length < pageSize) break;
    from += pageSize;
  }
  return new Map(rows.map((row) => [row.article_id, Number(row.mouvement_count)]));
}

// Choisit le prochain "lot de travail" (jusqu'a tailleLot lignes article+lot
// physique) : parmi tout ce qui a un stock systeme positif et n'a pas
// encore ete distribue dans CETTE session, priorise l'article le plus
// actif (mp_movement_counts) d'abord. Retourne le nombre de lignes creees -
// 0 = plus rien a distribuer, la session peut etre cloturee.
async function distribuerProchainLot(sessionId: number, tailleLot: number): Promise<number> {
  const [balances, movementCounts, assignedResult, maxLotResult] = await Promise.all([
    fetchAllLotBalances(),
    fetchMovementCounts(),
    supabaseServer.from("inventaire_mp_lignes").select("article_id, numero_lot").eq("session_id", sessionId),
    supabaseServer
      .from("inventaire_mp_lignes")
      .select("lot_numero")
      .eq("session_id", sessionId)
      .order("lot_numero", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const assignedKeys = new Set(
    ((assignedResult.data ?? []) as { article_id: number; numero_lot: string }[]).map(
      (row) => `${row.article_id}::${row.numero_lot}`
    )
  );

  const restants = balances.filter((row) => !assignedKeys.has(`${row.article_id}::${row.numero_lot}`));

  restants.sort((a, b) => {
    const moveDiff = (movementCounts.get(b.article_id) ?? 0) - (movementCounts.get(a.article_id) ?? 0);
    if (moveDiff !== 0) return moveDiff;
    if (a.article_id !== b.article_id) return a.article_id - b.article_id;
    return a.numero_lot.localeCompare(b.numero_lot);
  });

  const selection = restants.slice(0, tailleLot);
  if (selection.length === 0) return 0;

  const nextLotNumero = Number((maxLotResult.data as { lot_numero: number } | null)?.lot_numero ?? 0) + 1;

  const { error } = await supabaseServer.from("inventaire_mp_lignes").insert(
    selection.map((row) => ({
      session_id: sessionId,
      article_id: row.article_id,
      numero_lot: row.numero_lot,
      lot_numero: nextLotNumero,
      stock_systeme: row.stock,
    }))
  );
  if (error) throw new Error(error.message);

  return selection.length;
}

export async function demarrerInventaireMpAction(formData: FormData) {
  const currentUser = await requireInventaireWrite();

  const { data: activeSession } = await supabaseServer
    .from("inventaire_mp_sessions")
    .select("id")
    .eq("statut", "en_cours")
    .maybeSingle();
  if (activeSession) {
    throw new Error("Un inventaire est deja en cours.");
  }

  const tailleLotRaw = Number(formData.get("taille_lot"));
  const tailleLot = Number.isFinite(tailleLotRaw) ? Math.trunc(tailleLotRaw) : 0;
  if (tailleLot < TAILLE_LOT_MIN || tailleLot > TAILLE_LOT_MAX) {
    throw new Error(`Choisis un nombre d'articles entre ${TAILLE_LOT_MIN} et ${TAILLE_LOT_MAX}.`);
  }

  const { data: session, error } = await supabaseServer
    .from("inventaire_mp_sessions")
    .insert({ taille_lot: tailleLot, cree_par: currentUser })
    .select("id")
    .single();
  if (error) throw new Error(error.message);

  const sessionId = (session as { id: number }).id;
  const distribues = await distribuerProchainLot(sessionId, tailleLot);

  if (distribues === 0) {
    await supabaseServer
      .from("inventaire_mp_sessions")
      .update({ statut: "termine", termine_at: new Date().toISOString() })
      .eq("id", sessionId);
  }

  await logAudit({
    utilisateur: currentUser,
    module: "InventaireMp",
    action: "creation",
    cible: `Session #${sessionId}`,
    resume: `Inventaire MP demarre (lots de ${tailleLot})`,
  });

  revalidatePath("/stock/matiere-premiere/inventaire");
}

// Enregistre le comptage saisi pour chaque ligne du lot de travail courant
// (un champ par ligne encore "a_compter") - compare a l'aveugle contre le
// stock systeme deja fige sur la ligne (jamais affiche a l'utilisateur avant
// l'ecart confirme), avance vers bon/recompte/ecart confirme, puis distribue
// le lot de travail suivant si celui-ci est desormais entierement resolu.
export async function soumettreComptageAction(formData: FormData) {
  const currentUser = await requireInventaireWrite();

  const sessionId = Number(formData.get("session_id"));
  if (!sessionId) throw new Error("Session invalide.");

  const { data: sessionData, error: sessionError } = await supabaseServer
    .from("inventaire_mp_sessions")
    .select("id, statut, taille_lot")
    .eq("id", sessionId)
    .maybeSingle();
  if (sessionError || !sessionData) throw new Error("Session introuvable.");
  const session = sessionData as { id: number; statut: string; taille_lot: number };
  if (session.statut !== "en_cours") throw new Error("Cet inventaire est deja termine.");

  const ligneIds = formData
    .getAll("ligne_id")
    .map((value) => Number(value))
    .filter((id) => Number.isFinite(id) && id > 0);
  if (ligneIds.length === 0) throw new Error("Aucune ligne a enregistrer.");

  const { data: lignesData, error: lignesError } = await supabaseServer
    .from("inventaire_mp_lignes")
    .select("id, stock_systeme, compte_1, compte_2, compte_3, nombre_comptages, statut")
    .in("id", ligneIds)
    .eq("session_id", sessionId);
  if (lignesError) throw new Error(lignesError.message);
  const lignes = (lignesData ?? []) as LigneRow[];

  for (const ligne of lignes) {
    if (ligne.statut !== "a_compter") continue;

    const raw = String(formData.get(`compte_${ligne.id}`) || "").trim().replace(",", ".");
    if (!raw) continue;
    const valeur = Number(raw);
    if (!Number.isFinite(valeur) || valeur < 0) continue;

    const match = Math.abs(valeur - Number(ligne.stock_systeme)) < EPSILON;
    const nombreComptages = ligne.nombre_comptages + 1;
    const compteField =
      ligne.nombre_comptages === 0 ? "compte_1" : ligne.nombre_comptages === 1 ? "compte_2" : "compte_3";
    const nouveauStatut = match ? "bon" : nombreComptages >= 3 ? "ecart_confirme" : "a_compter";

    const { error: updateError } = await supabaseServer
      .from("inventaire_mp_lignes")
      .update({
        [compteField]: valeur,
        nombre_comptages: nombreComptages,
        statut: nouveauStatut,
        compte_par: currentUser,
        updated_at: new Date().toISOString(),
      })
      .eq("id", ligne.id);
    if (updateError) throw new Error(updateError.message);
  }

  // Le lot de travail courant est-il entierement resolu (plus aucune ligne
  // "a_compter" dedans) ? Si oui, distribue le suivant, sinon la page
  // recontinuera de montrer les lignes qui ont encore besoin d'un recomptage.
  const { data: maxLotData } = await supabaseServer
    .from("inventaire_mp_lignes")
    .select("lot_numero")
    .eq("session_id", sessionId)
    .order("lot_numero", { ascending: false })
    .limit(1)
    .maybeSingle();
  const currentLotNumero = Number((maxLotData as { lot_numero: number } | null)?.lot_numero ?? 0);

  if (currentLotNumero > 0) {
    const { count: pendingCount } = await supabaseServer
      .from("inventaire_mp_lignes")
      .select("id", { count: "exact", head: true })
      .eq("session_id", sessionId)
      .eq("lot_numero", currentLotNumero)
      .eq("statut", "a_compter");

    if ((pendingCount ?? 0) === 0) {
      const distribues = await distribuerProchainLot(sessionId, session.taille_lot);
      if (distribues === 0) {
        await supabaseServer
          .from("inventaire_mp_sessions")
          .update({ statut: "termine", termine_at: new Date().toISOString() })
          .eq("id", sessionId);
      }
    }
  }

  revalidatePath("/stock/matiere-premiere/inventaire");
}

// Cree le mouvement de correction (une ligne dans lots_stock_matiere_premiere,
// meme article + meme lot/code) pour ramener le stock systeme au dernier
// comptage physique retenu - jamais automatique, uniquement sur action
// explicite de l'utilisateur depuis la page, une fois l'ecart confirme
// (3 comptages discordants).
export async function regulariserLigneAction(formData: FormData) {
  const currentUser = await requireInventaireWrite();

  const ligneId = Number(formData.get("ligne_id"));
  if (!ligneId) throw new Error("Ligne invalide.");

  const { data: ligneData, error: ligneError } = await supabaseServer
    .from("inventaire_mp_lignes")
    .select("id, session_id, article_id, numero_lot, stock_systeme, compte_1, compte_2, compte_3, statut")
    .eq("id", ligneId)
    .maybeSingle();
  if (ligneError || !ligneData) throw new Error("Ligne introuvable.");
  const ligne = ligneData as {
    id: number;
    session_id: number;
    article_id: number;
    numero_lot: string;
    stock_systeme: number;
    compte_1: number | null;
    compte_2: number | null;
    compte_3: number | null;
    statut: string;
  };

  if (ligne.statut !== "ecart_confirme") {
    throw new Error("Cette ligne n'est pas en ecart confirme.");
  }

  const valeurRetenue = ligne.compte_3 ?? ligne.compte_2 ?? ligne.compte_1;
  if (valeurRetenue === null || valeurRetenue === undefined) {
    throw new Error("Aucun comptage enregistre pour cette ligne.");
  }

  const diff = Number(valeurRetenue) - Number(ligne.stock_systeme);
  if (Math.abs(diff) < EPSILON) {
    throw new Error("Aucun ecart a regulariser.");
  }

  const [{ data: articleData }, { data: lotDepotData }] = await Promise.all([
    supabaseServer
      .from("articles_matiere_premiere")
      .select("unite, depot_id")
      .eq("id", ligne.article_id)
      .maybeSingle(),
    supabaseServer
      .from("lots_stock_matiere_premiere")
      .select("depot_id")
      .eq("article_id", ligne.article_id)
      .eq("numero_lot", ligne.numero_lot)
      .not("depot_id", "is", null)
      .limit(1)
      .maybeSingle(),
  ]);
  const article = articleData as { unite: string | null; depot_id: number | null } | null;
  const depotId = (lotDepotData as { depot_id: number | null } | null)?.depot_id ?? article?.depot_id ?? null;

  const nombreComptages = ligne.compte_3 !== null ? 3 : ligne.compte_2 !== null ? 2 : 1;

  const { error: insertError } = await supabaseServer.from("lots_stock_matiere_premiere").insert({
    article_id: ligne.article_id,
    numero_lot: ligne.numero_lot,
    code_normalise: ligne.numero_lot.toUpperCase(),
    date_jour: new Date().toISOString().slice(0, 10),
    qte_entree: diff > 0 ? diff : 0,
    qte_sortie: diff < 0 ? -diff : 0,
    unite: article?.unite ?? null,
    depot_id: depotId,
    note: `Regularisation inventaire #${ligne.session_id} - ecart constate apres ${nombreComptages} comptage(s)`,
    utilisateur: currentUser,
    source_import: "web:inventaire-mp",
  });
  if (insertError) throw new Error(insertError.message);

  const { error: updateError } = await supabaseServer
    .from("inventaire_mp_lignes")
    .update({
      statut: "regularise",
      regularise_par: currentUser,
      regularise_at: new Date().toISOString(),
    })
    .eq("id", ligneId);
  if (updateError) throw new Error(updateError.message);

  await logAudit({
    utilisateur: currentUser,
    module: "InventaireMp",
    action: "modification",
    cible: `${ligne.numero_lot} (article #${ligne.article_id})`,
    resume: `Regularisation stock inventaire - ecart de ${diff > 0 ? "+" : ""}${diff}`,
    avant: { stock_systeme: ligne.stock_systeme },
    apres: { stock_compte: valeurRetenue },
  });

  revalidatePath("/stock/matiere-premiere/inventaire");
}
