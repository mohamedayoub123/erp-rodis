import JSZip from "jszip";

// Outils pour remplir la presentation modele (assets/pptx/revue-processus-pr4-modele.pptx) : on garde son theme, ses
// diapositives et ses images, et on remplace seulement ce qui change a chaque trimestre. Un PowerPoint est un dossier
// zippe de fichiers XML : ces fonctions modifient ces fichiers et s'arretent avec un message clair si la structure du
// modele n'est plus celle attendue (ex : une diapositive deplacee).

export const POUCE = 914400; // EMU par pouce

export async function lireTexte(zip: JSZip, chemin: string): Promise<string> {
  const fichier = zip.file(chemin);
  if (!fichier) throw new Error(`Fichier absent du PowerPoint : ${chemin}`);
  return fichier.async("string");
}

// Tous les tableaux / graphiques d'une diapositive (pptxgenjs les ecrit en <p:graphicFrame>)
export function cadresDe(xmlDiapo: string): string[] {
  return xmlDiapo.match(/<p:graphicFrame>[\s\S]*?<\/p:graphicFrame>/g) ?? [];
}

export function retirerCadres(xmlDiapo: string): string {
  return xmlDiapo.replace(/<p:graphicFrame>[\s\S]*?<\/p:graphicFrame>/g, "");
}

// Retire une image de la diapositive d'apres son nom (ex : "Picture 3") et rend aussi son identifiant de relation
export function retirerImage(xmlDiapo: string, nom: string): { xml: string; relation: string } {
  let relation = "";
  const xml = xmlDiapo.replace(/<p:pic>[\s\S]*?<\/p:pic>/g, (bloc) => {
    if (!bloc.includes(`name="${nom}"`)) return bloc;
    relation = bloc.match(/r:embed="([^"]+)"/)?.[1] ?? "";
    return "";
  });
  if (!relation) throw new Error(`Image "${nom}" introuvable dans le modele PowerPoint.`);
  return { xml, relation };
}

// Ajoute des tableaux / graphiques en fin de diapositive (au-dessus du reste), avec des identifiants a eux
export function ajouterCadres(xmlDiapo: string, cadres: string[], premierId: number): string {
  const numerotes = cadres.map((cadre, index) => cadre.replace(/<p:cNvPr id="\d+"/, `<p:cNvPr id="${premierId + index}"`));
  if (!xmlDiapo.includes("</p:spTree>")) throw new Error("Diapositive du modele illisible.");
  return xmlDiapo.replace("</p:spTree>", `${numerotes.join("")}</p:spTree>`);
}

export function remplacerExactement(xml: string, ancien: string, nouveau: string): string {
  if (!xml.includes(ancien)) throw new Error(`Texte "${ancien}" introuvable dans le modele PowerPoint.`);
  return xml.replace(ancien, nouveau);
}

export function retirerRelation(rels: string, id: string): { rels: string; cible: string } {
  let cible = "";
  const resultat = rels.replace(new RegExp(`<Relationship Id="${id}"[^>]*/>`), (bloc) => {
    cible = bloc.match(/Target="([^"]+)"/)?.[1] ?? "";
    return "";
  });
  return { rels: resultat, cible };
}

export function ajouterRelation(rels: string, id: string, type: string, cible: string): string {
  return rels.replace("</Relationships>", `<Relationship Id="${id}" Type="${type}" Target="${cible}"/></Relationships>`);
}

export const TYPE_RELATION_GRAPHIQUE = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/chart";

// Echappe un texte pour l'ecrire dans un fichier XML
export function echapperXml(texte: string): string {
  return texte.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// Types de fichiers declares dans [Content_Types].xml
export function sansSurcharge(types: string, partie: string): string {
  return types.replace(new RegExp(`<Override PartName="${partie.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"[^>]*/>`), "");
}

export function avecSurcharge(types: string, partie: string, type: string): string {
  if (types.includes(`PartName="${partie}"`)) return types;
  return types.replace("</Types>", `<Override PartName="${partie}" ContentType="${type}"/></Types>`);
}

export function avecExtension(types: string, extension: string, type: string): string {
  if (types.includes(`Extension="${extension}"`)) return types;
  return types.replace("<Override", `<Default Extension="${extension}" ContentType="${type}"/><Override`);
}

export const TYPE_GRAPHIQUE = "application/vnd.openxmlformats-officedocument.drawingml.chart+xml";
export const TYPE_CLASSEUR = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

// Recopie un graphique cree par pptxgenjs (avec son classeur Excel integre) dans la presentation
export async function copierGraphique(source: JSZip, cible: JSZip, ancienNom: string, nouveauNom: string): Promise<void> {
  cible.file(`ppt/charts/${nouveauNom}`, await lireTexte(source, `ppt/charts/${ancienNom}`));
  const rels = await lireTexte(source, `ppt/charts/_rels/${ancienNom}.rels`);
  cible.file(`ppt/charts/_rels/${nouveauNom}.rels`, rels);
  for (const [, chemin] of rels.matchAll(/Target="\.\.\/(embeddings\/[^"]+)"/g)) {
    const classeur = source.file(`ppt/${chemin}`);
    if (!classeur) throw new Error(`Classeur du graphique introuvable : ${chemin}`);
    cible.file(`ppt/${chemin}`, await classeur.async("uint8array"));
  }
}

// ---------------------------------------------------------------- formes dessinees (organigramme, procedures, SWOT)
// Tout ce qu'une diapositive de la presentation temporaire contient (formes, textes, traits, tableaux) : les objets
// sont autonomes (sans fichier annexe), donc recopiables tels quels dans une diapositive du modele.
export function objetsDe(xmlDiapo: string): string {
  const balise = "</p:grpSpPr>";
  const debut = xmlDiapo.indexOf(balise);
  const fin = xmlDiapo.lastIndexOf("</p:spTree>");
  if (debut < 0 || fin < 0) throw new Error("Diapositive generee illisible.");
  return xmlDiapo.slice(debut + balise.length, fin);
}

// Place les objets SOUS ce que la diapositive contient deja (les titres et zones de texte du modele restent visibles
// au-dessus) ; leurs identifiants sont decales de [base] pour ne jamais en croiser un du modele.
export function ajouterObjetsEnDessous(xmlDiapo: string, objets: string, base: number): string {
  const balise = "</p:grpSpPr>";
  const i = xmlDiapo.indexOf(balise);
  if (i < 0) throw new Error("Diapositive du modele illisible.");
  const numerotes = objets.replace(/<p:cNvPr id="(\d+)"/g, (_, n: string) => `<p:cNvPr id="${base + Number(n)}"`);
  return xmlDiapo.slice(0, i + balise.length) + numerotes + xmlDiapo.slice(i + balise.length);
}

// Position (en pouces) d'une image de la diapositive d'apres son nom
export function rectDeImage(xmlDiapo: string, nom: string): { x: number; y: number; w: number; h: number } {
  for (const bloc of xmlDiapo.match(/<p:pic>[\s\S]*?<\/p:pic>/g) ?? []) {
    if (!bloc.includes(`name="${nom}"`)) continue;
    const m = bloc.match(/<a:off x="(-?\d+)" y="(-?\d+)"\/><a:ext cx="(\d+)" cy="(\d+)"\/>/);
    if (!m) break;
    return { x: Number(m[1]) / POUCE, y: Number(m[2]) / POUCE, w: Number(m[3]) / POUCE, h: Number(m[4]) / POUCE };
  }
  throw new Error(`Position de l'image "${nom}" introuvable dans le modele PowerPoint.`);
}

// Remplace le texte d'une zone de texte (en gardant la taille de sa premiere ligne)
export function remplacerTexteDeZone(xmlDiapo: string, nom: string, texte: string): string {
  let trouve = false;
  const xml = xmlDiapo.replace(/<p:sp>[\s\S]*?<\/p:sp>/g, (bloc) => {
    if (!bloc.includes(`name="${nom}"`)) return bloc;
    trouve = true;
    const taille = bloc.match(/<a:rPr[^>]*\bsz="(\d+)"/)?.[1];
    const paragraphe = `<a:p><a:r><a:rPr lang="fr-FR"${taille ? ` sz="${taille}"` : ""} dirty="0"/><a:t>${echapperXml(texte)}</a:t></a:r></a:p>`;
    return bloc.replace(/(<a:lstStyle\/>)[\s\S]*?(<\/p:txBody>)/, `$1${paragraphe}$2`);
  });
  if (!trouve) throw new Error(`Zone de texte "${nom}" introuvable dans le modele PowerPoint.`);
  return xml;
}

// Position (en pouces) d'une zone de texte d'apres son nom
export function rectDeZone(xmlDiapo: string, nom: string): { x: number; y: number; w: number; h: number } {
  for (const bloc of xmlDiapo.match(/<p:sp>[\s\S]*?<\/p:sp>/g) ?? []) {
    if (!bloc.includes(`name="${nom}"`)) continue;
    const m = bloc.match(/<a:off x="(-?\d+)" y="(-?\d+)"\/><a:ext cx="(\d+)" cy="(\d+)"\/>/);
    if (!m) break;
    return { x: Number(m[1]) / POUCE, y: Number(m[2]) / POUCE, w: Number(m[3]) / POUCE, h: Number(m[4]) / POUCE };
  }
  throw new Error(`Position de la zone de texte "${nom}" introuvable dans le modele PowerPoint.`);
}

// Une zone de texte qui depasse a droite de la diapositive est ramenee dedans (le texte passe a la ligne au besoin)
export function garderZoneDansLaDiapo(xmlDiapo: string, nom: string, largeurDiapo = 13.333, marge = 0.1): string {
  return xmlDiapo.replace(/<p:sp>[\s\S]*?<\/p:sp>/g, (bloc) => {
    if (!bloc.includes(`name="${nom}"`)) return bloc;
    const m = bloc.match(/<a:off x="(-?\d+)" y="(-?\d+)"\/><a:ext cx="(\d+)" cy="(\d+)"\/>/);
    if (!m) return bloc;
    const limite = Math.round((largeurDiapo - marge) * POUCE);
    if (Number(m[1]) + Number(m[3]) <= limite) return bloc;
    const largeur = Math.max(POUCE / 2, limite - Number(m[1]));
    return bloc
      .replace(m[0], `<a:off x="${m[1]}" y="${m[2]}"/><a:ext cx="${largeur}" cy="${m[4]}"/>`)
      .replace('wrap="none"', 'wrap="square"');
  });
}

// Bas estime (en pouces) d'une zone de texte une fois [texte] ecrit dedans : la zone du modele grandit toute seule avec
// son texte (retour a la ligne), donc on estime le nombre de lignes pour poser un dessin juste en dessous.
export function estimerBasDeZone(xmlDiapo: string, nom: string, texte: string, largeurDiapo = 13.333, marge = 0.1): number {
  const zone = rectDeZone(xmlDiapo, nom);
  const bloc = (xmlDiapo.match(/<p:sp>[\s\S]*?<\/p:sp>/g) ?? []).find((b) => b.includes(`name="${nom}"`)) ?? "";
  const taille = Number(bloc.match(/<a:rPr[^>]*\bsz="(\d+)"/)?.[1] ?? 1800) / 100;
  const largeur = Math.min(zone.w, largeurDiapo - marge - zone.x) - 0.2; // moins les marges internes de la zone
  const largeurTexte = (texte.length * 0.6 * taille) / 72; // Century Gothic : environ 0,6 x la taille par lettre
  const lignes = Math.max(1, Math.ceil(largeurTexte / Math.max(0.5, largeur)));
  return zone.y + (lignes * taille * 1.2) / 72 + 0.1;
}
