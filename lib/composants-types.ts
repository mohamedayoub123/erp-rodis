// Types d'articles de conditionnement affiches en colonnes dans le Tableau de commande. Aucun import serveur : aussi utilise cote
// navigateur (export Excel). Le calcul du stock et du besoin est dans lib/composants-conditionnement.ts.

export type TypeComposant = "capsule_pompe" | "flacon" | "etiquette" | "sleeve" | "etui" | "dispenseur" | "carton";

// Ordre des colonnes du tableau
export const TYPES_COMPOSANTS: { cle: TypeComposant; libelle: string }[] = [
  { cle: "capsule_pompe", libelle: "Capsule / Pompe" },
  { cle: "flacon", libelle: "Flacon / Flacon verre" },
  { cle: "etiquette", libelle: "Etiquette" },
  { cle: "sleeve", libelle: "Sleeve" },
  { cle: "etui", libelle: "Etui" },
  { cle: "dispenseur", libelle: "Dispenseur" },
  { cle: "carton", libelle: "Carton" },
];

// Un article de conditionnement de la Recette Conditionnement d'un article fini
export type ComposantArticle = {
  mpId: number;
  nom: string;
  unite: string;
  type: TypeComposant;
  // stock du Depot E (peut etre negatif : sorties saisies en trop)
  stock: number;
  // besoin pour toutes les commandes ouvertes (cartons a produire x recette)
  besoin: number;
};

function nettoyer(valeur: string | null | undefined) {
  return String(valeur ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toUpperCase();
}

// Type d'un article de conditionnement d'apres sa sous-famille (articles_matiere_premiere.sous_famille) ; null = pas dans le tableau
// (matieres de fabrication, sachets, bobines...).
//  - capsule / pompe : CAPSULE, PUMP, SPRAY (pompes et sprays), PIPETTE
//  - flacon : FLACON, FLACON PET, FLACONS VERRE, et les contenants POT, POT PET, TUBE VIDE (une creme n'a pas de flacon)
//  - dispenseur : les etuis "display / dispenser" (12 pieces) ; les autres ETUIS sont des etuis
export function typeComposant(sousFamille: string | null | undefined, nom: string | null | undefined): TypeComposant | null {
  const famille = nettoyer(sousFamille);
  if (famille === "CAPSULE" || famille === "PUMP" || famille === "SPRAY" || famille === "PIPETTE") return "capsule_pompe";
  if (
    famille === "FLACON" ||
    famille === "FLACON PET" ||
    famille === "FLACONS VERRE" ||
    famille === "POT" ||
    famille === "POT PET" ||
    famille === "TUBE VIDE"
  ) {
    return "flacon";
  }
  if (famille === "ETIQUETTE") return "etiquette";
  if (famille === "SLEEV" || famille === "SLEEVE") return "sleeve";
  if (famille === "ETUIS" || famille === "ETUI") return /DISPENS|DISPLAY/.test(nettoyer(nom)) ? "dispenseur" : "etui";
  if (famille === "CARTON") return "carton";
  return null;
}
