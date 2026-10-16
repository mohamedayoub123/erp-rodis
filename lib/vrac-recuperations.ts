// Recuperations de vrac de la Fabrication (fiche Entrer et fiche +) : une fiche peut recuperer le vrac de PLUSIEURS codes du module
// "Vrac a recuperer" (Depot B), chacun avec sa quantite.
//
// Stockage sans changer la base (colonnes production_rapports.code_vrac_recupere / qt_vrac_recupere) :
// - UN seul code (cas habituel, identique a avant) : code_vrac_recupere = "AB1104V", qt_vrac_recupere = la quantite ;
// - PLUSIEURS codes : code_vrac_recupere = "AB1104V (20) + AB1107V (5)" (lisible tel quel dans Suivi Production),
//   qt_vrac_recupere = le TOTAL (25). lireRecuperations() relit les deux formes.

export type Recuperation = { code: string; quantite: number };

export const MAX_RECUPERATIONS = 6;

function arrondi(valeur: number): number {
  return Math.round(valeur * 1000) / 1000;
}

// Codes identiques (majuscules/minuscules ignorees) additionnes en une seule ligne ; les lignes sans code ou a quantite 0 sont retirees.
export function fusionnerRecuperations(liste: Recuperation[]): Recuperation[] {
  const parCode = new Map<string, Recuperation>();
  for (const element of liste) {
    const code = element.code.trim();
    if (!code || !(element.quantite > 0)) continue;
    const cle = code.toLowerCase();
    const courant = parCode.get(cle);
    if (courant) courant.quantite = arrondi(courant.quantite + element.quantite);
    else parCode.set(cle, { code, quantite: arrondi(element.quantite) });
  }
  return [...parCode.values()];
}

// Relit les recuperations d'une fiche a partir des 2 colonnes (voir l'en-tete du fichier). Un code seul reprend la quantite totale.
export function lireRecuperations(code: string | null | undefined, quantiteTotale: number | null | undefined): Recuperation[] {
  const texte = (code ?? "").trim();
  if (!texte) return [];

  const plusieurs = texte.includes(" + ") || /\(\s*\d+(?:[.,]\d+)?\s*\)\s*$/.test(texte);
  if (!plusieurs) {
    const quantite = Number(quantiteTotale ?? 0);
    return [{ code: texte, quantite: Number.isFinite(quantite) ? quantite : 0 }];
  }

  const liste: Recuperation[] = [];
  for (const segment of texte.split(" + ")) {
    const propre = segment.trim();
    if (!propre) continue;
    const trouve = propre.match(/^(.+?)\s*\(\s*(\d+(?:[.,]\d+)?)\s*\)$/);
    if (trouve) liste.push({ code: trouve[1].trim(), quantite: Number(trouve[2].replace(",", ".")) });
    else liste.push({ code: propre, quantite: 0 });
  }
  return liste;
}

// Ce qu'on enregistre dans les 2 colonnes pour cette liste (deja fusionnee ou non).
export function encoderRecuperations(liste: Recuperation[]): { code: string | null; total: number } {
  const fusionnee = fusionnerRecuperations(liste);
  const total = arrondi(fusionnee.reduce((somme, element) => somme + element.quantite, 0));
  if (fusionnee.length === 0) return { code: null, total: 0 };
  if (fusionnee.length === 1) return { code: fusionnee[0].code, total };
  return { code: fusionnee.map((element) => `${element.code} (${element.quantite})`).join(" + "), total };
}

// Champs du formulaire : la 1re recuperation garde les noms d'origine (code_vrac_recupere / qt_vrac_recupere), les suivantes
// portent un suffixe (code_vrac_recupere_2 / qt_vrac_recupere_2 ...). Renvoie les lignes remplies, telles que saisies (non fusionnees).
export function nomChampRecuperation(champ: "code" | "qt", rang: number): string {
  const base = champ === "code" ? "code_vrac_recupere" : "qt_vrac_recupere";
  return rang <= 1 ? base : `${base}_${rang}`;
}

export function lireRecuperationsFormulaire(formData: FormData): Recuperation[] {
  const liste: Recuperation[] = [];
  for (let rang = 1; rang <= MAX_RECUPERATIONS; rang++) {
    const code = String(formData.get(nomChampRecuperation("code", rang)) ?? "").trim();
    const brut = String(formData.get(nomChampRecuperation("qt", rang)) ?? "").trim().replace(",", ".");
    const quantite = brut === "" ? 0 : Number(brut);
    if (!code && quantite === 0) continue;
    liste.push({ code, quantite });
  }
  return liste;
}
