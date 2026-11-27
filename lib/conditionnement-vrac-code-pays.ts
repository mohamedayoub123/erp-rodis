// Deux champs de l'Entree par ligne du Conditionnement : vrac jete (kg) et code pays (le "Code Ouganda" de l'Entree Production).
// Voir scripts/sql/add_dechet_vrac_code_pays_conditionnement.sql : tant qu'il n'est pas lance, les champs sont caches et rien ne change.
import { supabaseServer } from "@/lib/supabase-server";

export const SQL_VRAC_CODE_PAYS = "scripts/sql/add_dechet_vrac_code_pays_conditionnement.sql";

export async function colonnesVracEtCodePaysPresentes(): Promise<boolean> {
  const { error } = await supabaseServer.from("production_carton_entries").select("dechet_vrac, code_pays").limit(1);
  return !error;
}

// Un code pays saisi sur une fournee (id = ordre de saisie)
export type SaisieCodePays = { id: number; codePays: string };

export function cleCodePays(ligneId: number, code: string): string {
  return `${ligneId}::${code.trim().toUpperCase()}`;
}

// Codes pays saisis au Conditionnement pour ces lignes de programme, ranges par ligne + code. Colonne absente : rien.
export async function lireCodesPaysConditionnement(ligneIds: number[]): Promise<Map<string, SaisieCodePays[]>> {
  const parLigneCode = new Map<string, SaisieCodePays[]>();
  if (ligneIds.length === 0) return parLigneCode;

  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabaseServer
      .from("production_carton_entries")
      .select("id, programme_ligne_id, code, code_pays")
      .in("programme_ligne_id", ligneIds)
      .not("code_pays", "is", null)
      .order("id", { ascending: true })
      .range(from, from + pageSize - 1);
    if (error) break;

    const lignes = (data ?? []) as { id: number; programme_ligne_id: number; code: string | null; code_pays: string | null }[];
    for (const ligne of lignes) {
      const codePays = (ligne.code_pays ?? "").trim();
      if (!codePays) continue;
      const cle = cleCodePays(ligne.programme_ligne_id, ligne.code ?? "");
      parLigneCode.set(cle, [...(parLigneCode.get(cle) ?? []), { id: ligne.id, codePays }]);
    }
    if (lignes.length < pageSize) break;
  }
  return parLigneCode;
}

// Les codes pays differents (majuscules ou minuscules = le meme), le DERNIER saisi en premier : c'est lui qui est propose a l'Entree Production
export function codesPaysDistincts(saisies: SaisieCodePays[]): string[] {
  const vus = new Set<string>();
  const codes: string[] = [];
  for (const { codePays } of [...saisies].sort((a, b) => b.id - a.id)) {
    if (vus.has(codePays.toUpperCase())) continue;
    vus.add(codePays.toUpperCase());
    codes.push(codePays);
  }
  return codes;
}
