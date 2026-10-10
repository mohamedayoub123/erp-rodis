import { cache } from "react";
import { supabaseServer } from "@/lib/supabase-server";

// Contenance d'une matiere premiere : "sac de 25 kg", "fut de 200 L"... Le nombre (25, 200) est dans l'unite de
// l'article. Elle existe a 3 endroits :
//  - sur l'article (Articles Matiere Premiere) : la contenance habituelle, proposee a la reception ;
//  - sur chaque lot recu (lots_stock_matiere_premiere) : la contenance REELLE de ce lot, car un meme article peut
//    arriver en sacs de 25 kg dans un lot et de 20 kg dans un autre ;
//  - sur la reception d'import (bons_commande_mp_imports), pour l'historique du dossier.
// Les colonnes sont creees par scripts/sql/add_contenance_mp.sql ; tant que ce SQL n'est pas execute, l'ERP continue de
// marcher comme avant (rien n'est lu ni ecrit, la contenance n'est pas demandee).
export const contenanceMpDisponible = cache(async (): Promise<boolean> => {
  const tables = ["articles_matiere_premiere", "lots_stock_matiere_premiere", "bons_commande_mp_imports"];
  const resultats = await Promise.all(tables.map((table) => supabaseServer.from(table).select("contenance").limit(1)));
  return resultats.every((resultat) => !resultat.error);
});

export const SQL_CONTENANCE = "scripts/sql/add_contenance_mp.sql";

// Nombre saisi dans un formulaire ("25", "25,5") : null si vide ou invalide
export function lireContenance(valeur: FormDataEntryValue | null): number | null {
  const texte = String(valeur ?? "").trim().replace(",", ".");
  if (!texte) return null;
  const nombre = Number(texte);
  return Number.isFinite(nombre) ? nombre : null;
}

// "25 kg", "200 L" ; "-" si pas de contenance
export function formaterContenance(valeur: number | null | undefined, unite?: string | null): string {
  if (valeur === null || valeur === undefined) return "-";
  const nombre = Number(valeur).toLocaleString("fr-FR", { maximumFractionDigits: 3 });
  return unite ? `${nombre} ${unite}` : nombre;
}
