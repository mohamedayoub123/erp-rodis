// Filtres a choix multiples (Categorie, Sous famille...) des pages en GET : chaque valeur cochee part dans
// l'adresse sous le meme nom (?categorie=A&categorie=B). Aucun import serveur : aussi utilise cote navigateur.

// searchParams de Next : une seule valeur = string, plusieurs = string[]. Toujours une liste propre
// (espaces retires, sans vides ni doublons).
export function lireListeParam(valeur: string | string[] | undefined): string[] {
  const liste = Array.isArray(valeur) ? valeur : valeur ? [valeur] : [];
  return [...new Set(liste.map((element) => element.trim()).filter(Boolean))];
}

function normaliser(valeur: string) {
  return valeur.trim().toLowerCase();
}

// Liste vide = pas de filtre. Sinon la valeur doit etre l'une des valeurs choisies (sans tenir compte des
// majuscules) ; une valeur vide ne correspond jamais quand un filtre est actif.
export function correspondALaListe(valeur: string | null | undefined, liste: string[]): boolean {
  if (liste.length === 0) return true;
  if (!valeur || !valeur.trim()) return false;
  const cherchee = normaliser(valeur);
  return liste.some((element) => normaliser(element) === cherchee);
}

// Valeurs distinctes non vides, triees (pour remplir la liste d'un filtre).
export function optionsDistinctes(valeurs: (string | null | undefined)[]): string[] {
  const parCle = new Map<string, string>();
  for (const valeur of valeurs) {
    const propre = (valeur || "").trim();
    if (!propre) continue;
    if (!parCle.has(normaliser(propre))) parCle.set(normaliser(propre), propre);
  }
  return [...parCle.values()].sort((a, b) => a.localeCompare(b, "fr", { sensitivity: "base" }));
}

// Adresse d'une page avec ses filtres : les listes sont repetees (?categorie=A&categorie=B).
export function construireQuery(
  simples: Record<string, string | undefined>,
  listes: Record<string, string[]>
): string {
  const params = new URLSearchParams();
  for (const [cle, valeur] of Object.entries(simples)) {
    if (valeur) params.append(cle, valeur);
  }
  for (const [cle, valeurs] of Object.entries(listes)) {
    for (const valeur of valeurs) params.append(cle, valeur);
  }
  return params.toString();
}
