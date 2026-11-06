// Volume d'un colis (carton, sac, futs...) a partir de ses 3 dimensions en cm, et volume d'une quantite recue : fichier PUR
// (aucun import serveur) pour servir aussi bien dans le formulaire (navigateur) que dans les pages et les actions (serveur).
// Les dimensions sont enregistrees sur l'article (colonnes longueur/largeur/hauteur, voir scripts/sql/add_dimensions_poids_articles.sql,
// editables sur la fiche Produit) ; le volume n'est JAMAIS enregistre, toujours recalcule a partir d'elles.
//
// Nombre de colis d'une quantite = quantite / contenance (meme unite : pieces pour un article compte a la piece, kg sinon,
// voir lib/contenance-mp.ts) ; volume de la quantite = nombre de colis x volume d'un colis.

export type DimensionsColis = {
  longueur: number | null;
  largeur: number | null;
  hauteur: number | null;
};

function valeurPositive(valeur: number | null | undefined): valeur is number {
  return typeof valeur === "number" && Number.isFinite(valeur) && valeur > 0;
}

// Volume d'un colis en litres (cm x cm x cm / 1000) ; null si une dimension manque ou n'est pas positive
export function volumeColisLitres(
  longueur: number | null | undefined,
  largeur: number | null | undefined,
  hauteur: number | null | undefined
): number | null {
  if (!valeurPositive(longueur) || !valeurPositive(largeur) || !valeurPositive(hauteur)) return null;
  return (longueur * largeur * hauteur) / 1000;
}

export function volumeColisM3(
  longueur: number | null | undefined,
  largeur: number | null | undefined,
  hauteur: number | null | undefined
): number | null {
  const litres = volumeColisLitres(longueur, largeur, hauteur);
  return litres === null ? null : litres / 1000;
}

// Nombre de colis (peut etre decimal : 1000 pieces en cartons de 300 = 3,33) ; null sans contenance ou sans quantite
export function nombreColis(quantite: number | null | undefined, contenance: number | null | undefined): number | null {
  if (typeof quantite !== "number" || !Number.isFinite(quantite) || quantite < 0) return null;
  if (!valeurPositive(contenance)) return null;
  return quantite / contenance;
}

// Volume en m3 d'une quantite : null si la contenance ou le volume d'un colis est inconnu
export function volumeQuantiteM3(
  quantite: number | null | undefined,
  contenance: number | null | undefined,
  volumeColisEnLitres: number | null | undefined
): number | null {
  if (!valeurPositive(volumeColisEnLitres)) return null;
  const colis = nombreColis(quantite, contenance);
  return colis === null ? null : (colis * volumeColisEnLitres) / 1000;
}

// Somme des valeurs connues (volumes, nombres de colis : une valeur inconnue ne compte pas - jamais un chiffre devine) ; null si aucune n'est connue
export function sommeValeursConnues(volumes: (number | null)[]): number | null {
  let somme: number | null = null;
  for (const volume of volumes) {
    if (volume !== null) somme = (somme ?? 0) + volume;
  }
  return somme;
}

function formaterNombre(valeur: number, decimalesMax: number, decimalesMin = 0): string {
  return valeur.toLocaleString("fr-FR", { minimumFractionDigits: decimalesMin, maximumFractionDigits: decimalesMax });
}

// "30 L" ; "-" si inconnu
export function formaterLitres(litres: number | null | undefined): string {
  return typeof litres === "number" && Number.isFinite(litres) ? `${formaterNombre(litres, 2)} L` : "-";
}

// "0,030 m³" (3 decimales : un carton fait quelques centiemes de m3) ; "-" si inconnu.
// Le volume d'UN colis se lit avec 4 decimales ("0,0578 m³" et non "0,058") pour rester fidele a ses litres (57,8 L).
export function formaterM3(m3: number | null | undefined, decimales = 3): string {
  return typeof m3 === "number" && Number.isFinite(m3) ? `${formaterNombre(m3, decimales, decimales)} m³` : "-";
}

// "2" ou "3,33" ; "-" si inconnu
export function formaterNombreColis(colis: number | null | undefined): string {
  return typeof colis === "number" && Number.isFinite(colis) ? formaterNombre(colis, 2) : "-";
}

// "40 x 30 x 25" (cm) ; "-" tant que les 3 dimensions ne sont pas toutes connues
export function formaterDimensions(longueur: number | null | undefined, largeur: number | null | undefined, hauteur: number | null | undefined): string {
  if (!valeurPositive(longueur) || !valeurPositive(largeur) || !valeurPositive(hauteur)) return "-";
  return [longueur, largeur, hauteur].map((valeur) => formaterNombre(valeur, 2)).join(" x ");
}

// Nombre saisi dans un champ ("40", "25,5") : null si vide ou invalide
function lireNombre(valeur: FormDataEntryValue | null): number | null {
  const texte = String(valeur ?? "").trim().replace(",", ".");
  if (!texte) return null;
  const nombre = Number(texte);
  return Number.isFinite(nombre) ? nombre : null;
}

// Les 3 champs "longueur", "largeur", "hauteur" d'un formulaire : null si les 3 sont vides ; les trois ensemble et positifs
// sinon (un volume avec 2 dimensions sur 3 n'aurait aucun sens, donc on refuse plutot que d'enregistrer a moitie).
export function lireDimensionsColis(formData: FormData): { longueur: number; largeur: number; hauteur: number } | null {
  const longueur = lireNombre(formData.get("longueur"));
  const largeur = lireNombre(formData.get("largeur"));
  const hauteur = lireNombre(formData.get("hauteur"));
  const saisies = [longueur, largeur, hauteur];

  const vides = ["longueur", "largeur", "hauteur"].filter((nom) => String(formData.get(nom) ?? "").trim() === "");
  if (vides.length === 3) return null;
  if (vides.length > 0 || saisies.some((valeur) => valeur === null)) {
    throw new Error("Renseigne la longueur, la largeur et la hauteur ensemble (en cm).");
  }
  if (!valeurPositive(longueur) || !valeurPositive(largeur) || !valeurPositive(hauteur)) {
    throw new Error("La longueur, la largeur et la hauteur doivent etre superieures a 0 (en cm).");
  }
  return { longueur, largeur, hauteur };
}
