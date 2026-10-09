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
