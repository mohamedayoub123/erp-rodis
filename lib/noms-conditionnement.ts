import { supabaseServer } from "@/lib/supabase-server";

// Listes des noms "Chef de zone" / "Chef de ligne" du Conditionnement (table conditionnement_noms, voir
// scripts/sql/create_conditionnement_noms.sql). Quand une liste contient au moins un nom, la saisie de ce champ se limite aux noms
// de la liste (Entrer, Entrer par ligne, nouvelle fiche +) ; tant qu'elle est vide - ou que la table n'existe pas encore - la saisie
// reste libre, pour ne jamais bloquer le Conditionnement.

export const TYPES_NOM_CONDITIONNEMENT = ["chef_zone", "chef_ligne"] as const;
export type TypeNomConditionnement = (typeof TYPES_NOM_CONDITIONNEMENT)[number];

export const LIBELLE_TYPE_NOM: Record<TypeNomConditionnement, string> = {
  chef_zone: "Chef de zone",
  chef_ligne: "Chef de ligne",
};

export type NomsConditionnement = {
  chef_zone: string[];
  chef_ligne: string[];
  // false : la table n'existe pas encore (SQL pas lance) - les listes sont alors vides et la saisie libre
  tableDisponible: boolean;
};

// Page de gestion des listes (voir app/production/noms-conditionnement)
export const CLE_PAGE_NOMS_CONDITIONNEMENT = "productionNomsConditionnement";
export const URL_PAGE_NOMS_CONDITIONNEMENT = "/production/noms-conditionnement";

export function nettoyerNom(valeur: string): string {
  return valeur.replace(/\s+/g, " ").trim();
}

export async function lireNomsConditionnement(): Promise<NomsConditionnement> {
  const { data, error } = await supabaseServer
    .from("conditionnement_noms")
    .select("type, nom")
    .order("nom", { ascending: true })
    .limit(2000);

  if (error) return { chef_zone: [], chef_ligne: [], tableDisponible: false };

  const resultat: NomsConditionnement = { chef_zone: [], chef_ligne: [], tableDisponible: true };
  for (const ligne of (data ?? []) as { type: string; nom: string }[]) {
    if (ligne.type === "chef_zone" || ligne.type === "chef_ligne") resultat[ligne.type].push(ligne.nom);
  }
  const trier = (noms: string[]) => noms.sort((a, b) => a.localeCompare(b, "fr", { sensitivity: "base" }));
  trier(resultat.chef_zone);
  trier(resultat.chef_ligne);
  return resultat;
}

const CHAMPS_CONTROLES: { champ: string; type: TypeNomConditionnement; libelle: string }[] = [
  { champ: "chef_zone", type: "chef_zone", libelle: "chef de zone" },
  { champ: "chef_ligne", type: "chef_ligne", libelle: "chef de ligne" },
];

// Controle serveur des champs "chef de zone" / "chef de ligne" d'un formulaire Conditionnement : quand la liste correspondante n'est pas
// vide, le nom doit en faire partie (majuscules/minuscules ignorees) et est remplace par son ecriture exacte de la liste.
// Leve une Error au message clair sinon.
export async function verifierNomsConditionnement(formData: FormData): Promise<void> {
  const noms = await lireNomsConditionnement();
  for (const { champ, type, libelle } of CHAMPS_CONTROLES) {
    const liste = noms[type];
    if (liste.length === 0) continue;
    const saisi = nettoyerNom(String(formData.get(champ) ?? ""));
    if (!saisi) continue;
    const trouve = liste.find((nom) => nom.toLowerCase() === saisi.toLowerCase());
    if (!trouve) {
      throw new Error(
        `Nom du ${libelle} "${saisi}" absent de la liste : choisis un nom de la liste (les noms se gerent dans Production > Noms Conditionnement).`
      );
    }
    formData.set(champ, trouve);
  }
}
