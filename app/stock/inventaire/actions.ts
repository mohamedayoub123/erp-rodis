"use server";

import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import {
  getCurrentStockUser,
  canInventairePfDemarrerUser,
  canInventairePfCompterUser,
  canInventairePfRegulariserUser,
} from "@/lib/stock-auth";
import { logAudit } from "@/lib/audit-log";
import { fetchAllLotBalances, fetchArticleCategorieById, fetchArticleGammeById } from "./lib";

// Tolerance flottante pour comparer un comptage physique au stock systeme -
// jamais une egalite stricte (quantites avec decimales).
const EPSILON = 0.01;
const TAILLE_LOT_MIN = 1;
const TAILLE_LOT_MAX = 200;

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

// 3 autorisations distinctes (demande explicite) au lieu d'un seul "write"
// generique - demarrer/annuler une session, saisir un comptage physique et
// regulariser le stock sont 3 responsabilites separees.
async function requireInventaireDemarrer() {
  const currentUser = await getCurrentStockUser();
  if (!(await canInventairePfDemarrerUser(currentUser))) {
    throw new Error("Cet utilisateur ne peut pas demarrer/annuler un inventaire PF.");
  }
  return currentUser;
}

async function requireInventaireCompter() {
  const currentUser = await getCurrentStockUser();
  if (!(await canInventairePfCompterUser(currentUser))) {
    throw new Error("Cet utilisateur ne peut pas saisir de comptage sur l'inventaire PF.");
  }
  return currentUser;
}

async function requireInventaireRegulariser() {
  const currentUser = await getCurrentStockUser();
  if (!(await canInventairePfRegulariserUser(currentUser))) {
    throw new Error("Cet utilisateur ne peut pas regulariser le stock PF.");
  }
  return currentUser;
}

async function fetchMovementCounts(): Promise<Map<number, number>> {
  const rows: MovementCountRow[] = [];
  let from = 0;
  const pageSize = 1000;
  for (;;) {
    const { data, error } = await supabaseServer.rpc("pf_movement_counts").range(from, from + pageSize - 1);
    if (error) throw new Error(error.message);
    const chunk = (data ?? []) as MovementCountRow[];
    rows.push(...chunk);
    if (chunk.length < pageSize) break;
    from += pageSize;
  }
  return new Map(rows.map((row) => [row.article_id, Number(row.mouvement_count)]));
}

// Articles produit fini reellement inventoriables - exclut le vrac (matiere
// non conditionnee, non comptable physiquement comme un article fini),
// meme regle que le reste du site (Tableau de commandes, etc.).
async function fetchArticlesFiniIds(): Promise<Set<number>> {
  const ids = new Set<number>();
  let from = 0;
  const pageSize = 1000;
  for (;;) {
    const { data, error } = await supabaseServer
      .from("articles")
      .select("id")
      .eq("nature", "fini")
      .range(from, from + pageSize - 1);
    if (error) throw new Error(error.message);
    const chunk = (data ?? []) as { id: number }[];
    for (const row of chunk) ids.add(row.id);
    if (chunk.length < pageSize) break;
    from += pageSize;
  }
  return ids;
}

// Choisit le prochain "lot de travail" (jusqu'a tailleLot lignes article+lot
// physique) : parmi tout ce qui a un stock systeme positif (articles finis
// seulement, jamais le vrac) et n'a pas encore ete distribue dans CETTE
// session, priorise l'article le plus actif (pf_movement_counts) d'abord.
// categoriesFiltre/gammesFiltre limite l'univers de cette session a
// certaines categories (type_article) et/ou gammes (null/vide = pas de
// filtre sur cette dimension) - meme regle que cote MP : un seul des 2
// remplis = ce filtre seul, les 2 remplis ENSEMBLE = intersection. Permet
// aussi de lancer plusieurs inventaires en parallele, chacun sur son propre
// perimetre.
// Retourne le nombre de lignes creees - 0 = plus rien a distribuer dans le
// perimetre de cette session, elle peut etre cloturee.
async function distribuerProchainLot(
  sessionId: number,
  tailleLot: number,
  categoriesFiltre: string[] | null,
  gammesFiltre: string[] | null
): Promise<number> {
  const hasCategorieFiltre = !!categoriesFiltre && categoriesFiltre.length > 0;
  const hasGammeFiltre = !!gammesFiltre && gammesFiltre.length > 0;

  const [balances, movementCounts, articlesFiniIds, categorieByArticleId, gammeByArticleId, assignedResult, maxLotResult] =
    await Promise.all([
      fetchAllLotBalances(),
      fetchMovementCounts(),
      fetchArticlesFiniIds(),
      hasCategorieFiltre ? fetchArticleCategorieById() : Promise.resolve(null),
      hasGammeFiltre ? fetchArticleGammeById() : Promise.resolve(null),
      supabaseServer.from("inventaire_pf_lignes").select("article_id, numero_lot").eq("session_id", sessionId),
      supabaseServer
        .from("inventaire_pf_lignes")
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

  const categorieSet = hasCategorieFiltre ? new Set(categoriesFiltre) : null;
  const gammeSet = hasGammeFiltre ? new Set(gammesFiltre) : null;

  const restants = balances.filter((row) => {
    if (!articlesFiniIds.has(row.article_id)) return false;
    if (assignedKeys.has(`${row.article_id}::${row.numero_lot}`)) return false;
    if (!categorieSet && !gammeSet) return true;
    const matchesCategorie = categorieSet ? categorieSet.has(categorieByArticleId?.get(row.article_id) ?? "") : false;
    const matchesGamme = gammeSet ? gammeSet.has(gammeByArticleId?.get(row.article_id) ?? "") : false;
    return hasCategorieFiltre && hasGammeFiltre ? matchesCategorie && matchesGamme : matchesCategorie || matchesGamme;
  });

  restants.sort((a, b) => {
    const moveDiff = (movementCounts.get(b.article_id) ?? 0) - (movementCounts.get(a.article_id) ?? 0);
    if (moveDiff !== 0) return moveDiff;
    if (a.article_id !== b.article_id) return a.article_id - b.article_id;
    return a.numero_lot.localeCompare(b.numero_lot);
  });

  const selection = restants.slice(0, tailleLot);
  if (selection.length === 0) return 0;

  const nextLotNumero = Number((maxLotResult.data as { lot_numero: number } | null)?.lot_numero ?? 0) + 1;

  const { error } = await supabaseServer.from("inventaire_pf_lignes").insert(
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

export async function demarrerInventairePfAction(formData: FormData) {
  const currentUser = await requireInventaireDemarrer();

  const tailleLotRaw = Number(formData.get("taille_lot"));
  const tailleLot = Number.isFinite(tailleLotRaw) ? Math.trunc(tailleLotRaw) : 0;
  if (tailleLot < TAILLE_LOT_MIN || tailleLot > TAILLE_LOT_MAX) {
    throw new Error(`Choisis un nombre d'articles entre ${TAILLE_LOT_MIN} et ${TAILLE_LOT_MAX}.`);
  }

  // Plusieurs sessions peuvent tourner en meme temps (demande explicite,
  // meme fonctionnement que cote MP), chacune sur ses propres categories
  // et/ou gammes - vide/rien coche = tout le PF, comme avant.
  const categories = formData.getAll("categorie").map((value) => String(value).trim()).filter(Boolean);
  const gammes = formData.getAll("gamme").map((value) => String(value).trim()).filter(Boolean);

  const { data: session, error } = await supabaseServer
    .from("inventaire_pf_sessions")
    .insert({
      taille_lot: tailleLot,
      cree_par: currentUser,
      categories_filtre: categories.length > 0 ? categories : null,
      gammes_filtre: gammes.length > 0 ? gammes : null,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);

  const sessionId = (session as { id: number }).id;
  const distribues = await distribuerProchainLot(
    sessionId,
    tailleLot,
    categories.length > 0 ? categories : null,
    gammes.length > 0 ? gammes : null
  );

  if (distribues === 0) {
    await supabaseServer
      .from("inventaire_pf_sessions")
      .update({ statut: "termine", termine_at: new Date().toISOString() })
      .eq("id", sessionId);
  }

  const scopeParts = [
    categories.length > 0 ? `categories: ${categories.join(", ")}` : null,
    gammes.length > 0 ? `gammes: ${gammes.join(", ")}` : null,
  ].filter(Boolean);

  await logAudit({
    utilisateur: currentUser,
    module: "InventairePf",
    action: "creation",
    cible: `Session #${sessionId}`,
    resume: `Inventaire PF demarre (lots de ${tailleLot}${scopeParts.length > 0 ? `, ${scopeParts.join(", ")}` : ""})`,
  });

  revalidatePath("/stock/inventaire");
}

// Abandonne une session en cours (bouton "Annuler l'inventaire") - rien
// n'est supprime, seul le statut change pour liberer la page et permettre
// de demarrer une nouvelle session.
export async function annulerInventairePfAction(formData: FormData) {
  const currentUser = await requireInventaireDemarrer();

  const sessionId = Number(formData.get("session_id"));
  if (!sessionId) throw new Error("Session invalide.");

  const { data: sessionData, error: sessionError } = await supabaseServer
    .from("inventaire_pf_sessions")
    .select("id, statut")
    .eq("id", sessionId)
    .maybeSingle();
  if (sessionError || !sessionData) throw new Error("Session introuvable.");
  if ((sessionData as { statut: string }).statut !== "en_cours") {
    throw new Error("Cet inventaire n'est plus en cours.");
  }

  const { error } = await supabaseServer
    .from("inventaire_pf_sessions")
    .update({ statut: "annule", termine_at: new Date().toISOString() })
    .eq("id", sessionId);
  if (error) throw new Error(error.message);

  await logAudit({
    utilisateur: currentUser,
    module: "InventairePf",
    action: "modification",
    cible: `Session #${sessionId}`,
    resume: `Inventaire PF annule`,
  });

  revalidatePath("/stock/inventaire");
}

// Supprime definitivement une session de l'historique (bouton corbeille) -
// uniquement une session terminee/annulee, jamais celle en cours (qui doit
// passer par "Annuler l'inventaire" d'abord). Les regularisations deja
// appliquees restent en place sur lots_stock - supprimer la session
// n'annule pas les corrections de stock deja faites, seulement la trace de
// la session elle-meme.
export async function supprimerSessionInventairePfAction(formData: FormData) {
  const currentUser = await requireInventaireDemarrer();

  const sessionId = Number(formData.get("session_id"));
  if (!sessionId) throw new Error("Session invalide.");

  const { data: sessionData, error: sessionError } = await supabaseServer
    .from("inventaire_pf_sessions")
    .select("id, statut")
    .eq("id", sessionId)
    .maybeSingle();
  if (sessionError || !sessionData) throw new Error("Session introuvable.");
  if ((sessionData as { statut: string }).statut === "en_cours") {
    throw new Error("Annule d'abord cet inventaire avant de le supprimer.");
  }

  const { error } = await supabaseServer.from("inventaire_pf_sessions").delete().eq("id", sessionId);
  if (error) throw new Error(error.message);

  await logAudit({
    utilisateur: currentUser,
    module: "InventairePf",
    action: "suppression",
    cible: `Session #${sessionId}`,
    resume: `Inventaire PF supprime de l'historique`,
  });

  revalidatePath("/stock/inventaire");
}

// Enregistre le comptage saisi pour chaque ligne du lot de travail courant
// (un champ par ligne encore "a_compter") - compare a l'aveugle contre le
// stock systeme deja fige sur la ligne (jamais affiche a l'utilisateur avant
// l'ecart confirme), avance vers bon/recompte/ecart confirme, puis distribue
// le lot de travail suivant si celui-ci est desormais entierement resolu.
export async function soumettreComptagePfAction(formData: FormData) {
  const currentUser = await requireInventaireCompter();

  const sessionId = Number(formData.get("session_id"));
  if (!sessionId) throw new Error("Session invalide.");

  const { data: sessionData, error: sessionError } = await supabaseServer
    .from("inventaire_pf_sessions")
    .select("id, statut, taille_lot, categories_filtre, gammes_filtre")
    .eq("id", sessionId)
    .maybeSingle();
  if (sessionError || !sessionData) throw new Error("Session introuvable.");
  const session = sessionData as {
    id: number;
    statut: string;
    taille_lot: number;
    categories_filtre: string[] | null;
    gammes_filtre: string[] | null;
  };
  if (session.statut !== "en_cours") throw new Error("Cet inventaire est deja termine.");

  const ligneIds = formData
    .getAll("ligne_id")
    .map((value) => Number(value))
    .filter((id) => Number.isFinite(id) && id > 0);
  if (ligneIds.length === 0) throw new Error("Aucune ligne a enregistrer.");

  const { data: lignesData, error: lignesError } = await supabaseServer
    .from("inventaire_pf_lignes")
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
      .from("inventaire_pf_lignes")
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
    .from("inventaire_pf_lignes")
    .select("lot_numero")
    .eq("session_id", sessionId)
    .order("lot_numero", { ascending: false })
    .limit(1)
    .maybeSingle();
  const currentLotNumero = Number((maxLotData as { lot_numero: number } | null)?.lot_numero ?? 0);

  if (currentLotNumero > 0) {
    const { count: pendingCount } = await supabaseServer
      .from("inventaire_pf_lignes")
      .select("id", { count: "exact", head: true })
      .eq("session_id", sessionId)
      .eq("lot_numero", currentLotNumero)
      .eq("statut", "a_compter");

    if ((pendingCount ?? 0) === 0) {
      const distribues = await distribuerProchainLot(
        sessionId,
        session.taille_lot,
        session.categories_filtre,
        session.gammes_filtre
      );
      if (distribues === 0) {
        await supabaseServer
          .from("inventaire_pf_sessions")
          .update({ statut: "termine", termine_at: new Date().toISOString() })
          .eq("id", sessionId);
      }
    }
  }

  revalidatePath("/stock/inventaire");
}

// Cree le mouvement de correction (une ligne dans lots_stock, meme article +
// meme lot/code) pour ramener le stock systeme au dernier comptage physique
// retenu - jamais automatique, uniquement sur action explicite de
// l'utilisateur depuis la page, une fois l'ecart confirme (3 comptages
// discordants). lots_stock (PF) n'a pas de colonne unite/depot_id fiable
// (contrairement a lots_stock_matiere_premiere) - la correction se limite
// aux champs reellement utilises sur les autres ecritures PF.
export async function regulariserLignePfAction(formData: FormData) {
  const currentUser = await requireInventaireRegulariser();

  const ligneId = Number(formData.get("ligne_id"));
  if (!ligneId) throw new Error("Ligne invalide.");

  const { data: ligneData, error: ligneError } = await supabaseServer
    .from("inventaire_pf_lignes")
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

  const nombreComptages = ligne.compte_3 !== null ? 3 : ligne.compte_2 !== null ? 2 : 1;

  const aujourdhui = new Date().toISOString().slice(0, 10);
  // date_fabrication est NOT NULL sur lots_stock (contrairement a ce qu'un
  // premier passage laissait supposer) - une regularisation n'a pas de
  // vraie date de fabrication, on retombe donc sur la date du jour comme le
  // reste de la ligne.
  const { error: insertError } = await supabaseServer.from("lots_stock").insert({
    article_id: ligne.article_id,
    numero_lot: ligne.numero_lot,
    code_normalise: ligne.numero_lot.toUpperCase(),
    date_jour: aujourdhui,
    date_fabrication: aujourdhui,
    qte_entree: diff > 0 ? diff : 0,
    qte_sortie: diff < 0 ? -diff : 0,
    note: `Regularisation inventaire #${ligne.session_id} - ecart constate apres ${nombreComptages} comptage(s)`,
    utilisateur: currentUser,
    source_import: "web:inventaire-pf",
  });
  if (insertError) throw new Error(insertError.message);

  const { error: updateError } = await supabaseServer
    .from("inventaire_pf_lignes")
    .update({
      statut: "regularise",
      regularise_par: currentUser,
      regularise_at: new Date().toISOString(),
    })
    .eq("id", ligneId);
  if (updateError) throw new Error(updateError.message);

  await logAudit({
    utilisateur: currentUser,
    module: "InventairePf",
    action: "modification",
    cible: `${ligne.numero_lot} (article #${ligne.article_id})`,
    resume: `Regularisation stock inventaire PF - ecart de ${diff > 0 ? "+" : ""}${diff}`,
    avant: { stock_systeme: ligne.stock_systeme },
    apres: { stock_compte: valeurRetenue },
  });

  revalidatePath("/stock/inventaire");
}

// Decision explicite du responsable de NE PAS corriger le stock pour cet
// ecart (le laisser "comme il est") - meme principe que
// ignorerEcartLigneAction cote MP : un ecart confirme ne doit jamais
// disparaitre tout seul (fermeture automatique de la session) sans que
// quelqu'un ait choisi entre regulariser et laisser tel quel. Aucune
// ecriture sur lots_stock ici, uniquement une trace de la decision.
export async function ignorerEcartLignePfAction(formData: FormData) {
  const currentUser = await requireInventaireRegulariser();

  const ligneId = Number(formData.get("ligne_id"));
  if (!ligneId) throw new Error("Ligne invalide.");

  const { data: ligneData, error: ligneError } = await supabaseServer
    .from("inventaire_pf_lignes")
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

  const { error: updateError } = await supabaseServer
    .from("inventaire_pf_lignes")
    .update({
      statut: "ecart_ignore",
      ignore_par: currentUser,
      ignore_at: new Date().toISOString(),
    })
    .eq("id", ligneId);
  if (updateError) throw new Error(updateError.message);

  await logAudit({
    utilisateur: currentUser,
    module: "InventairePf",
    action: "modification",
    cible: `${ligne.numero_lot} (article #${ligne.article_id})`,
    resume: "Ecart d'inventaire laisse tel quel (stock non modifie)",
    avant: { stock_systeme: ligne.stock_systeme },
    apres: { stock_compte: valeurRetenue },
  });

  revalidatePath("/stock/inventaire");
}
