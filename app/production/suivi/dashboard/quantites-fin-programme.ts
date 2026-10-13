import { supabaseServer } from "@/lib/supabase-server";
import { computeProduitParCode } from "../data";

// Quantites prevue et FAITE d'un code, pour les pages "Historique Fin programme" (Fabrication = vrac en kg,
// Conditionnement = cartons). Meme calcul que le Dashboard : une ligne decoupee en plusieurs lots (numero_lot = "AA1, AA2")
// donne un code par lot, chacun avec sa part prevue (numero_lot_detail) et ce qui a ete saisi pour CE code.
export type LigneQuantites = {
  id: number;
  numero_lot: string | null;
  numero_lot_detail: { code: string; qt_vrac: number | null; qt_carton: number | null }[] | null;
  vrac_a_fabriquer: number | null;
  qt_carton: number | null;
};

export type QuantiteCode = { prevu: number | null; fait: number };

type EntreeRow = { programme_ligne_id: number; code: string | null; quantite: number | string | null };

async function lireEntrees(table: string, ligneIds: number[]): Promise<EntreeRow[]> {
  const rows: EntreeRow[] = [];
  const tailleLot = 100;
  for (let debut = 0; debut < ligneIds.length; debut += tailleLot) {
    const ids = ligneIds.slice(debut, debut + tailleLot);
    for (let from = 0; ; from += 1000) {
      const { data, error } = await supabaseServer
        .from(table)
        .select("programme_ligne_id, code, quantite")
        .in("programme_ligne_id", ids)
        .range(from, from + 999);
      if (error) break;
      const lot = (data ?? []) as EntreeRow[];
      rows.push(...lot);
      if (lot.length < 1000) break;
    }
  }
  return rows;
}

// Cle du resultat : "ligneId::code"
export async function lireQuantitesParCode(
  stage: "vrac" | "carton",
  lignes: LigneQuantites[]
): Promise<Map<string, QuantiteCode>> {
  const resultat = new Map<string, QuantiteCode>();
  if (lignes.length === 0) return resultat;

  const entrees = await lireEntrees(
    stage === "vrac" ? "production_vrac_entries" : "production_carton_entries",
    lignes.map((ligne) => ligne.id)
  );
  const entreesParLigne = new Map<number, { code: string; quantite: number }[]>();
  for (const entree of entrees) {
    const liste = entreesParLigne.get(entree.programme_ligne_id) ?? [];
    liste.push({ code: entree.code ?? "", quantite: Number(entree.quantite ?? 0) });
    entreesParLigne.set(entree.programme_ligne_id, liste);
  }

  for (const ligne of lignes) {
    const codesBruts = (ligne.numero_lot || "").split(",").map((c) => c.trim()).filter(Boolean);
    const codes = codesBruts.length > 0 ? codesBruts : [ligne.numero_lot || "-"];
    const detail = ligne.numero_lot_detail ?? [];
    const avecDetail = codesBruts.length > 1 && detail.length === codesBruts.length;

    const prevuParCode = new Map<string, number | null>();
    if (avecDetail) {
      for (const part of detail) prevuParCode.set(part.code, (stage === "vrac" ? part.qt_vrac : part.qt_carton) ?? null);
    } else {
      for (const code of codes) prevuParCode.set(code, (stage === "vrac" ? ligne.vrac_a_fabriquer : ligne.qt_carton) ?? null);
    }

    const faitParCode = computeProduitParCode(entreesParLigne.get(ligne.id) ?? [], codes, (code) => prevuParCode.get(code) ?? 0);
    for (const code of codes) {
      resultat.set(`${ligne.id}::${code}`, { prevu: prevuParCode.get(code) ?? null, fait: faitParCode.get(code) ?? 0 });
    }
  }

  return resultat;
}
