import { cache } from "react";
import { supabaseServer } from "@/lib/supabase-server";

// Contenance d'une matiere premiere : "Sac de 25 kg", "Fut de 200 kg", "Barrique de 220 kg", "Carton de 25 kg". La
// contenance est en kg, sauf pour les articles comptes a la piece (cartons, flacons, sleeves, etiquettes... : unite "pcs")
// ou elle est en PIECES ("Carton de 1 000 pieces", voir uniteContenance) ; le type (Sac, Fut, Barrique, Carton, Bidon) se choisit
// dans une liste fixe. Elle existe a 3 endroits :
//  - sur l'article (Articles Matiere Premiere) : la contenance habituelle, proposee a la reception ;
//  - sur chaque lot recu (lots_stock_matiere_premiere) : la contenance REELLE de ce lot, car un meme article peut
//    arriver en sacs de 25 kg dans un lot et de 20 kg dans un autre ;
//  - sur la reception d'import (bons_commande_mp_imports), pour l'historique du dossier.
// Colonnes creees par scripts/sql/add_contenance_mp.sql (contenance) et scripts/sql/add_conditionnement_mp.sql (type) ;
// tant qu'un de ces SQL n'est pas execute, la partie correspondante n'est ni lue, ni ecrite, ni demandee.
const TABLES_CONTENANCE = ["articles_matiere_premiere", "lots_stock_matiere_premiere", "bons_commande_mp_imports"];

async function colonnePresenteSurLesTables(colonne: string): Promise<boolean> {
  const resultats = await Promise.all(TABLES_CONTENANCE.map((table) => supabaseServer.from(table).select(colonne).limit(1)));
  return resultats.every((resultat) => !resultat.error);
}

export const contenanceMpDisponible = cache(() => colonnePresenteSurLesTables("contenance"));
export const conditionnementMpDisponible = cache(() => colonnePresenteSurLesTables("conditionnement"));

export const SQL_CONTENANCE = "scripts/sql/add_contenance_mp.sql";
export const SQL_CONDITIONNEMENT = "scripts/sql/add_conditionnement_mp.sql";

// Liste fixe des types de contenant (le code est ce qui est enregistre)
export const CONDITIONNEMENTS = [
  { code: "SAC", libelle: "Sac" },
  { code: "FUT", libelle: "Fût" },
  { code: "BARRIQUE", libelle: "Barrique" },
  { code: "CARTON", libelle: "Carton" },
  { code: "BIDON", libelle: "Bidon" },
] as const;

export type CodeConditionnement = (typeof CONDITIONNEMENTS)[number]["code"];

// Unite dans laquelle la contenance se compte, d'apres l'unite de l'article : "pieces" pour un article compte a la piece
// (unite pcs : cartons, articles de conditionnement), "kg" pour le reste. null/undefined = unite inconnue -> kg.
export function uniteContenance(uniteArticle: string | null | undefined): "kg" | "pièces" {
  return /^(pcs?|pi[eè]ces?|unit[eé]s?)$/i.test(String(uniteArticle ?? "").trim()) ? "pièces" : "kg";
}

// Nombre saisi dans un formulaire ("25", "25,5") : null si vide ou invalide
export function lireContenance(valeur: FormDataEntryValue | null): number | null {
  const texte = String(valeur ?? "").trim().replace(",", ".");
  if (!texte) return null;
  const nombre = Number(texte);
  return Number.isFinite(nombre) ? nombre : null;
}

// Type choisi dans la liste : null si rien n'est choisi ; une valeur hors liste est refusee
export function lireConditionnement(valeur: FormDataEntryValue | null): CodeConditionnement | null {
  const texte = String(valeur ?? "").trim().toUpperCase();
  if (!texte) return null;
  const trouve = CONDITIONNEMENTS.find((c) => c.code === texte);
  if (!trouve) throw new Error("Type de contenance invalide : choisis Sac, Fût, Barrique, Carton ou Bidon.");
  return trouve.code;
}

// "Sac de 25 kg", "Carton de 1 000 pièces", "25 kg" (sans type), "Sac" (sans nombre) ; "-" si rien. uniteArticle = unite de
// l'article (pcs -> pièces, sinon kg).
export function formaterContenance(
  valeur: number | null | undefined,
  conditionnement?: string | null,
  uniteArticle?: string | null
): string {
  const libelle = CONDITIONNEMENTS.find((c) => c.code === conditionnement)?.libelle ?? null;
  const unite = uniteContenance(uniteArticle);
  const nombre =
    valeur === null || valeur === undefined
      ? null
      : `${Number(valeur).toLocaleString("fr-FR", { maximumFractionDigits: 3 })} ${unite === "pièces" && Number(valeur) <= 1 ? "pièce" : unite}`;
  if (libelle && nombre) return `${libelle} de ${nombre}`;
  return libelle ?? nombre ?? "-";
}
