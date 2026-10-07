import { supabaseServer } from "@/lib/supabase-server";

// Les deux facons de saisir une fournee de Conditionnement (voir scripts/sql/add_conditionnement_par_ligne.sql) :
// - Entree simple : le formulaire habituel (mode_saisie vide sur toutes les fournees deja saisies) ;
// - Entree par ligne : releves de poids/cadence + casiers coches (mode_saisie = 'par_ligne').
// Un MEME code ne peut jamais avoir les deux : sinon les cartons seraient comptes deux fois.
export type ModesSaisieConditionnement = {
  simple: boolean;
  parLigne: boolean;
  // Le SQL add_conditionnement_par_ligne.sql n'a pas encore ete execute : tout est vu comme "simple"
  // et l'Entree par ligne reste fermee, sans rien casser de l'Entree simple.
  colonneAbsente: boolean;
};

export const MODE_PAR_LIGNE = "par_ligne";

// Un code "" (ancienne fournee partagee, avant le suivi par code) ne compte que pour une ligne qui n'a
// jamais ete decoupee en plusieurs codes - meme regle que la page Conditionnement pour le pre-remplissage.
export async function fetchModesSaisieConditionnement(
  ligneId: number,
  code: string,
  numeroLot?: string | null
): Promise<ModesSaisieConditionnement> {
  let lotDeLaLigne = numeroLot;
  if (lotDeLaLigne === undefined) {
    const { data } = await supabaseServer.from("programme_lignes").select("numero_lot").eq("id", ligneId).maybeSingle();
    lotDeLaLigne = (data as { numero_lot: string | null } | null)?.numero_lot ?? null;
  }

  const nbCodes = (lotDeLaLigne || "").split(",").map((c) => c.trim()).filter(Boolean).length;
  const codes = code && nbCodes <= 1 ? [code, ""] : [code];

  const avecMode = await supabaseServer
    .from("production_carton_entries")
    .select("id, mode_saisie")
    .eq("programme_ligne_id", ligneId)
    .in("code", codes);

  if (!avecMode.error) {
    const lignes = (avecMode.data ?? []) as { id: number; mode_saisie: string | null }[];
    const parLigne = lignes.some((ligne) => ligne.mode_saisie === MODE_PAR_LIGNE);
    return { simple: lignes.some((ligne) => ligne.mode_saisie !== MODE_PAR_LIGNE), parLigne, colonneAbsente: false };
  }

  // Colonne mode_saisie absente (SQL pas encore execute) : on retombe sur "il y a des fournees = simple".
  const sansMode = await supabaseServer
    .from("production_carton_entries")
    .select("id")
    .eq("programme_ligne_id", ligneId)
    .in("code", codes)
    .limit(1);
  return { simple: (sansMode.data ?? []).length > 0, parLigne: false, colonneAbsente: true };
}

// Nb de pieces par carton de l'article de la ligne (fiche Article Produit Fini) - null si inconnu.
export async function fetchPiecesParCartonLigne(ligneId: number): Promise<number | null> {
  const { data: ligneData } = await supabaseServer
    .from("programme_lignes")
    .select("article_id, produit")
    .eq("id", ligneId)
    .maybeSingle();
  const ligne = ligneData as { article_id: number | null; produit: string | null } | null;
  if (!ligne) return null;

  const requete = supabaseServer.from("articles").select("piece_par_carton");
  const { data } = ligne.article_id
    ? await requete.eq("id", ligne.article_id).maybeSingle()
    : ligne.produit
      ? await requete.eq("nom_article", ligne.produit).limit(1).maybeSingle()
      : { data: null };

  const piecesParCarton = Number((data as { piece_par_carton: number | null } | null)?.piece_par_carton ?? 0);
  return piecesParCarton > 0 ? piecesParCarton : null;
}
