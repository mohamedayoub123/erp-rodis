import { supabaseServer } from "@/lib/supabase-server";

// Codes du plan comptable (voir scripts/sql/create_comptabilite_plan_comptable.sql,
// structure SYSCOHADA) - toujours reference par code ici, jamais par id en
// dur, pour rester lisible et resistant a un reseed.
export const COMPTE_ACHAT_MP = "601000";
export const COMPTE_FOURNISSEURS = "401000";
export const COMPTE_STOCK_MP = "321000";
export const COMPTE_VARIATION_STOCK_MP = "603100";
export const COMPTE_EN_COURS_PRODUCTION = "331000";
export const COMPTE_STOCK_PRODUIT_FINI = "361000";
export const COMPTE_VARIATION_STOCK_PF = "713600";
export const COMPTE_CLIENTS = "411000";
export const COMPTE_VENTES = "701000";
export const COMPTE_PERTES_STOCK = "658000";

export type LigneEcriture = { compteCode: string; debit: number; credit: number };

// Cree une ecriture (en-tete + lignes) en une fois - verifie que la partie
// double est equilibree AVANT d'inserer quoi que ce soit (jamais une
// ecriture bancale en base, meme partiellement).
export async function creerEcriture(params: {
  dateEcriture: string;
  pieceReference?: string | null;
  libelle: string;
  sourceType: string;
  sourceId: string;
  createdBy?: string | null;
  lignes: LigneEcriture[];
}) {
  const totalDebit = params.lignes.reduce((sum, l) => sum + l.debit, 0);
  const totalCredit = params.lignes.reduce((sum, l) => sum + l.credit, 0);

  if (Math.abs(totalDebit - totalCredit) > 0.01) {
    throw new Error(
      `Ecriture non equilibree (${params.sourceType}/${params.sourceId}) : debit ${totalDebit} != credit ${totalCredit}.`
    );
  }

  const codes = [...new Set(params.lignes.map((l) => l.compteCode))];
  const { data: comptesData, error: comptesError } = await supabaseServer
    .from("comptes_comptables")
    .select("id, code")
    .in("code", codes);

  if (comptesError) {
    throw new Error(comptesError.message);
  }

  const compteIdByCode = new Map(
    ((comptesData ?? []) as { id: number; code: string }[]).map((c) => [c.code, c.id])
  );

  const manquants = codes.filter((code) => !compteIdByCode.has(code));
  if (manquants.length > 0) {
    throw new Error(`Compte(s) comptable(s) introuvable(s) : ${manquants.join(", ")}.`);
  }

  const { data: ecritureRow, error: ecritureError } = await supabaseServer
    .from("ecritures_comptables")
    .insert([
      {
        date_ecriture: params.dateEcriture,
        piece_reference: params.pieceReference ?? null,
        libelle: params.libelle,
        source_type: params.sourceType,
        source_id: params.sourceId,
        created_by: params.createdBy ?? null,
      },
    ])
    .select("id")
    .single();

  if (ecritureError) {
    throw new Error(ecritureError.message);
  }

  const ecritureId = (ecritureRow as { id: number }).id;

  const { error: lignesError } = await supabaseServer.from("ecriture_lignes").insert(
    params.lignes.map((l) => ({
      ecriture_id: ecritureId,
      compte_id: compteIdByCode.get(l.compteCode),
      debit: l.debit,
      credit: l.credit,
    }))
  );

  if (lignesError) {
    throw new Error(lignesError.message);
  }

  return ecritureId;
}

// Efface l'ecriture (et ses lignes, via on delete cascade) liee a une
// source donnee, si elle existe - utilise avant de recreer une ecriture
// pour un evenement remplace (ex: Fabrication resauvegardee).
export async function supprimerEcriturePourSource(sourceType: string, sourceId: string) {
  const { error } = await supabaseServer
    .from("ecritures_comptables")
    .delete()
    .eq("source_type", sourceType)
    .eq("source_id", sourceId);

  if (error) {
    throw new Error(error.message);
  }
}

// Solde (debit-credit) de CHAQUE compte du plan comptable, code compte ->
// solde - calcul partage entre Balance, Bilan et Compte de resultat (evite
// de refaire cette pagination/somme 3 fois avec un risque de divergence).
export async function fetchSoldesParCompte(): Promise<Map<string, number>> {
  const comptes: { id: number; code: string }[] = [];
  const lignes: { compte_id: number; debit: number; credit: number }[] = [];
  const pageSize = 1000;

  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabaseServer
      .from("comptes_comptables")
      .select("id, code")
      .range(from, from + pageSize - 1);
    if (error) break;
    const chunk = (data as { id: number; code: string }[] | null) ?? [];
    comptes.push(...chunk);
    if (chunk.length < pageSize) break;
  }

  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabaseServer
      .from("ecriture_lignes")
      .select("compte_id, debit, credit")
      .range(from, from + pageSize - 1);
    if (error) break;
    const chunk = (data as { compte_id: number; debit: number; credit: number }[] | null) ?? [];
    lignes.push(...chunk);
    if (chunk.length < pageSize) break;
  }

  const soldeByCompteId = new Map<number, number>();
  for (const ligne of lignes) {
    soldeByCompteId.set(
      ligne.compte_id,
      (soldeByCompteId.get(ligne.compte_id) ?? 0) + Number(ligne.debit ?? 0) - Number(ligne.credit ?? 0)
    );
  }

  const soldeByCode = new Map<string, number>();
  for (const compte of comptes) {
    soldeByCode.set(compte.code, soldeByCompteId.get(compte.id) ?? 0);
  }

  return soldeByCode;
}

function normalizeFournisseur(value: string) {
  return value.replace(/ /g, "").trim().toUpperCase();
}

// Meme logique find-or-create que normalizeClient/createClientAction
// (app/clients/actions.ts), appliquee a fournisseurs - utilisee par le hook
// automatique de reception MP pour ne jamais dupliquer un fournisseur deja
// connu sous un nom presque identique.
export async function resoudreOuCreerFournisseur(nomFournisseur: string): Promise<number | null> {
  const nom = nomFournisseur.trim();
  if (!nom) return null;

  const normalise = normalizeFournisseur(nom);

  const { data: existing } = await supabaseServer
    .from("fournisseurs")
    .select("id")
    .eq("fournisseur_normalise", normalise)
    .maybeSingle();

  if (existing) {
    return (existing as { id: number }).id;
  }

  const { data: created, error } = await supabaseServer
    .from("fournisseurs")
    .insert([{ nom_fournisseur: nom, fournisseur_normalise: normalise }])
    .select("id")
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return (created as { id: number }).id;
}
