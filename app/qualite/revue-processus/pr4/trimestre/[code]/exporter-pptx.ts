import { readFile } from "node:fs/promises";
import path from "node:path";
import JSZip from "jszip";
import PptxGenJS from "pptxgenjs";
import type { TrimestrePr4 } from "@/lib/trimestres-pr4";
import { INDICATEURS_DIAPO, estDansLaCible, lireIndicateursAnnee } from "./indicateurs-trimestre";
import { dernierMoisAffiche, lireKpiArretProduction, lireKpiCoutCarton } from "./kpi-donnees";
import {
  TYPE_CLASSEUR,
  TYPE_GRAPHIQUE,
  TYPE_RELATION_GRAPHIQUE,
  ajouterCadres,
  ajouterRelation,
  avecExtension,
  avecSurcharge,
  cadresDe,
  copierGraphique,
  echapperXml,
  lireTexte,
  retirerCadres,
  retirerImage,
  retirerRelation,
  sansSurcharge,
} from "./pptx-modele";

// PowerPoint du "Rapport de revue de processus PR4" d'un trimestre. On part de la presentation modele du service
// qualite (assets/pptx/revue-processus-pr4-modele.pptx) : meme theme, memes 12 diapositives, memes images pour
// l'organigramme, les procedures et le SWOT. Seules les diapositives qui changent chaque trimestre sont remplies :
//   1  page de garde       -> "2026 / T2"
//   5  Indicateur          -> tableau des indicateurs (T1 jusqu'au trimestre) + les 3 lignes de resume
//   6  KPI                 -> graphique temps d'arret / production realisee
//   7  KPI cout du carton  -> graphique multi-sources
// Les tableaux et graphiques sont de vrais objets PowerPoint (modifiables), pas des images.
const CHEMIN_MODELE = path.join(process.cwd(), "assets", "pptx", "revue-processus-pr4-modele.pptx");
const VERT = "0B9A46";
const ROUGE = "E00000";
const POLICE = "Century Gothic";
const POLICE_TABLEAU = "Calibri";
const ORANGE = "ED7D31";

const pctUneDecimale = (valeur: number | null) =>
  valeur === null ? "-" : `${valeur.toLocaleString("fr-FR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;

type CelluleTableau = PptxGenJS.TableCell;

// ---------------------------------------------------------------- pieces generees par pptxgenjs
// Chaque piece est creee sur sa propre diapositive d'une presentation temporaire, puis greffee dans le modele.
export type Donnees = {
  trimestre: TrimestrePr4;
  indicateurs: Awaited<ReturnType<typeof lireIndicateursAnnee>>;
  arretProduction: Awaited<ReturnType<typeof lireKpiArretProduction>>;
  coutCarton: Awaited<ReturnType<typeof lireKpiCoutCarton>>;
};

function pieceIndicateurs(slide: PptxGenJS.Slide, { trimestre, indicateurs }: Donnees) {
  const colonnes = indicateurs.filter((t) => t.trimestre <= trimestre.trimestre);
  // plus il y a de trimestres, plus il y a de colonnes : on resserre un peu pour que tout tienne au-dessus du resume
  const compact = colonnes.length >= 3;
  const entete = { bold: true, fill: { color: "F2F2F2" }, color: "111111", fontSize: compact ? 8 : 8.5, align: "center" as const, valign: "middle" as const };
  const rangees: CelluleTableau[][] = [
    [
      { text: "INDICATEUR", options: entete },
      { text: "MÉTHODE DE CALCUL", options: entete },
      { text: String(trimestre.annee), options: entete },
      { text: "Fréquence de mesure", options: entete },
      ...colonnes.map((t) => ({ text: `action T${t.trimestre}`, options: entete })),
      { text: "plan d'action", options: entete },
    ],
  ];
  for (const ind of INDICATEURS_DIAPO) {
    const fond = ind.fondOrange ? { color: "F8CBAD" } : undefined;
    const base = { fontSize: compact ? 7 : 7.5, align: "center" as const, valign: "middle" as const, color: "111111", fill: fond };
    rangees.push([
      { text: ind.indicateur, options: base },
      { text: ind.methode, options: base },
      { text: ind.cibleTexte, options: base },
      { text: ind.numero === 1 || ind.numero === 3 ? "" : "trimestrielle", options: base },
      ...colonnes.map((t): CelluleTableau => {
        const valeur = t.valeurs[ind.numero];
        if (valeur === null || valeur === undefined) return { text: t.complet ? "-" : "", options: { ...base, color: "999999" } };
        const atteint = ind.cible ? estDansLaCible(ind.cible, valeur) : null;
        const texte = valeur.toLocaleString("fr-FR", { minimumFractionDigits: ind.decimales, maximumFractionDigits: ind.decimales });
        return {
          text: ind.pourcentage ? `${texte}%` : texte,
          options: { ...base, bold: true, color: atteint === null ? "111111" : atteint ? VERT : ROUGE },
        };
      }),
      { text: ind.planAction, options: { ...base, fontSize: compact ? 6.5 : 7, color: "1F4FB5" } },
    ]);
  }
  const largeurTotale = 9.95;
  const largeurQuart = compact && colonnes.length >= 4 ? 0.5 : 0.55;
  const largeurTexte = colonnes.length >= 4 ? 2.0 : compact ? 2.1 : 2.2;
  const fixes = largeurTexte * 2 + 0.7 + 0.8 + largeurQuart * colonnes.length;
  slide.addTable(rangees as PptxGenJS.TableRow[], {
    x: 0.43,
    y: 0.8,
    w: largeurTotale,
    colW: [largeurTexte, largeurTexte, 0.7, 0.8, ...colonnes.map(() => largeurQuart), Math.max(1.6, largeurTotale - fixes)],
    margin: [0.03, 0.05, 0.03, 0.05],
    border: { type: "solid", color: "666666", pt: 0.5 },
    fontFace: POLICE_TABLEAU,
    rowH: 0.25,
  });
}

function pieceKpiArretProduction(slide: PptxGenJS.Slide, pres: PptxGenJS, { arretProduction }: Donnees) {
  const labels = arretProduction.categories.map((c) => (c ? `${c[0]} ${c[1]}` : " "));
  slide.addChart(
    pres.ChartType.line,
    [
      { name: "Temps d'arrêt (%)", labels, values: arretProduction.arret as number[] },
      { name: "Production réalisée (%)", labels, values: arretProduction.production as number[] },
    ],
    {
      x: 0.25,
      y: 0.75,
      w: 10.2,
      h: 6.55,
      chartColors: ["4472C4", ORANGE],
      lineSize: 2.5,
      lineDataSymbol: "diamond",
      lineDataSymbolSize: 7,
      showTitle: true,
      title: "% TEMPS D'ARRÊT ET PRODUCTION RÉALISÉE",
      titleFontFace: POLICE,
      titleFontSize: 16,
      titleColor: "595959",
      showLegend: true,
      legendPos: "t",
      legendFontFace: POLICE,
      legendFontSize: 11,
      legendColor: "595959",
      valAxisMinVal: 0,
      valAxisMaxVal: 120,
      valAxisMajorUnit: 20,
      valAxisLabelFormatCode: '0"%"',
      valAxisLabelFontFace: POLICE,
      valAxisLabelFontSize: 10,
      valAxisLabelColor: "595959",
      catAxisLabelFontFace: POLICE,
      catAxisLabelFontSize: 9,
      catAxisLabelColor: "595959",
      showValue: true,
      dataLabelFormatCode: '0"%"',
      dataLabelFontFace: POLICE,
      dataLabelFontSize: 9,
      dataLabelColor: "595959",
      dataLabelPosition: "t",
      displayBlanksAs: "gap",
      valGridLine: { color: "D9D9D9", size: 0.5 },
      catGridLine: { color: "D9D9D9", size: 0.5 },
    } as PptxGenJS.IChartOpts
  );
}

function pieceKpiCoutCarton(slide: PptxGenJS.Slide, pres: PptxGenJS, { coutCarton }: Donnees) {
  const labels = coutCarton.categories.map((c) => `${c[0]} ${c[1]}`);
  const serie = (nom: string, valeurs: (number | null)[]) => ({ name: nom, labels, values: valeurs as number[] });
  slide.addChart(
    pres.ChartType.line,
    [
      serie("Coût carton / journalier totale", coutCarton.r1),
      serie("Coût carton / journalier cosmétique", coutCarton.r2),
      serie("Coût carton / journalier cosmétique et énergie cosmétique", coutCarton.r3),
      serie("Coût carton / coût journalier et énergie totale", coutCarton.r4),
      serie("Coût carton / coût journalier totale, embauches et énergie totale", coutCarton.r5),
      serie("nb carton fabriqué (÷ 100)", coutCarton.nbCarton),
      serie("Coût carton / énergie, salaire total et dépenses techniques", coutCarton.r6),
    ],
    {
      x: 0.4,
      y: 1.0,
      w: 10.0,
      h: 6.3,
      chartColors: ["4A7EBB", "BE4B48", "98B954", "7D60A0", "46AAC5", "F79646", "2C4D75"],
      lineSize: 2,
      lineDataSymbolSize: 6,
      showTitle: true,
      title: "variation coût de carton par mois",
      titleFontFace: POLICE,
      titleFontSize: 14,
      titleColor: "404040",
      showLegend: true,
      legendPos: "b",
      legendFontFace: POLICE,
      legendFontSize: 8,
      legendColor: "595959",
      valAxisMinVal: 0,
      valAxisLabelFormatCode: "#,##0",
      valAxisLabelFontFace: POLICE,
      valAxisLabelFontSize: 9,
      catAxisLabelFontFace: POLICE,
      catAxisLabelFontSize: 8,
      showValue: true,
      dataLabelFormatCode: "#,##0.0",
      dataLabelFontFace: POLICE,
      dataLabelFontSize: 7,
      dataLabelPosition: "t",
      displayBlanksAs: "gap",
      valGridLine: { color: "E1E1E1", size: 0.5 },
    } as PptxGenJS.IChartOpts
  );
}

async function construirePieces(donnees: Donnees): Promise<JSZip> {
  const pres = new PptxGenJS();
  pres.layout = "LAYOUT_WIDE";
  pieceIndicateurs(pres.addSlide(), donnees); // diapositive 1
  pieceKpiArretProduction(pres.addSlide(), pres, donnees); // diapositive 2
  pieceKpiCoutCarton(pres.addSlide(), pres, donnees); // diapositive 3
  const sortie = (await pres.write({ outputType: "nodebuffer" })) as Buffer;
  return JSZip.loadAsync(sortie);
}

// ---------------------------------------------------------------- assemblage dans le modele
const rels = (n: number) => `ppt/slides/_rels/slide${n}.xml.rels`;
const diapo = (n: number) => `ppt/slides/slide${n}.xml`;

// Supprime une image du modele si plus aucune diapositive ne l'utilise
async function supprimerImageInutilisee(modele: JSZip, cible: string) {
  const chemin = `ppt/${cible.replace(/^\.\.\//, "")}`;
  for (const nom of Object.keys(modele.files)) {
    if (!nom.endsWith(".rels")) continue;
    if ((await lireTexte(modele, nom)).includes(`Target="${cible}"`)) return;
  }
  modele.remove(chemin);
}

// Cadres (tableaux / graphiques) d'une diapositive de la presentation temporaire
async function cadresDeLaPiece(pieces: JSZip, numero: number): Promise<{ cadres: string[]; graphique?: string }> {
  const cadres = cadresDe(await lireTexte(pieces, `ppt/slides/slide${numero}.xml`));
  const relations = await lireTexte(pieces, `ppt/slides/_rels/slide${numero}.xml.rels`);
  // pptxgenjs ecrit la cible en absolu ("/ppt/charts/chart1.xml")
  const graphique = relations.match(/Target="(?:\.\.|\/ppt)\/charts\/(chart\d+\.xml)"/)?.[1];
  return { cadres, graphique };
}

export async function chargerDonnees(trimestre: TrimestrePr4): Promise<Donnees> {
  const dernierMois = dernierMoisAffiche(trimestre.annee, trimestre.trimestre);
  const [indicateurs, arretProduction, coutCarton] = await Promise.all([
    lireIndicateursAnnee(trimestre.annee),
    lireKpiArretProduction(dernierMois),
    lireKpiCoutCarton(trimestre.annee, dernierMois),
  ]);
  return { trimestre, indicateurs, arretProduction, coutCarton };
}

export async function construireRevuePptx(trimestre: TrimestrePr4): Promise<Buffer> {
  return assemblerRevuePptx(await chargerDonnees(trimestre));
}

export async function assemblerRevuePptx(donnees: Donnees): Promise<Buffer> {
  const { trimestre, indicateurs } = donnees;
  const modele = await JSZip.loadAsync(await readFile(CHEMIN_MODELE));
  const pieces = await construirePieces(donnees);
  let types = await lireTexte(modele, "[Content_Types].xml");

  // ---- 1. page de garde : trimestre
  {
    const xml = await lireTexte(modele, diapo(1));
    const nouveau = xml.replace(/<a:t>\d{4} \/ T\d<\/a:t>/, `<a:t>${trimestre.annee} / T${trimestre.trimestre}</a:t>`);
    if (nouveau === xml && !xml.includes(`${trimestre.annee} / T${trimestre.trimestre}`)) throw new Error("Trimestre de la page de garde introuvable dans le modele.");
    modele.file(diapo(1), nouveau);
  }

  // ---- 5. Indicateur : tableau + resume
  {
    const { cadres } = await cadresDeLaPiece(pieces, 1);
    const sansImage = retirerImage(await lireTexte(modele, diapo(5)), "Picture 3");
    const relations = retirerRelation(await lireTexte(modele, rels(5)), sansImage.relation);
    modele.file(rels(5), relations.rels);
    await supprimerImageInutilisee(modele, relations.cible);

    const courant = indicateurs.find((t) => t.trimestre === trimestre.trimestre);
    const lignes = [
      `Indicateur : ${courant?.complet ? pctUneDecimale(courant.pourcentageAtteint) : "-"} d’indicateur atteint`,
      `Kpi ok : ${courant?.complet ? courant.kpiOk : "-"}`,
      `Kpi totale : ${courant?.complet ? courant.kpiTotal : "-"}`,
    ];
    const paragraphes = lignes.map((ligne) => `<a:p><a:r><a:rPr lang="fr-FR" dirty="0"/><a:t>${echapperXml(ligne)}</a:t></a:r></a:p>`).join("");
    const avecTexte = sansImage.xml.replace(/(name="TextBox 4"[\s\S]*?<a:lstStyle\/>)[\s\S]*?(<\/p:txBody>)/, `$1${paragraphes}$2`);
    if (avecTexte === sansImage.xml) throw new Error("Zone de texte du resume des indicateurs introuvable dans le modele.");
    modele.file(diapo(5), ajouterCadres(avecTexte, cadres, 100));
  }

  // ---- 6. KPI : temps d'arret et production realisee (remplace le graphique du modele, lie a un classeur du poste)
  {
    const { cadres, graphique } = await cadresDeLaPiece(pieces, 2);
    if (!graphique) throw new Error("Graphique KPI non genere.");
    for (const ancien of ["ppt/charts/style1.xml", "ppt/charts/colors1.xml"]) {
      modele.remove(ancien);
      types = sansSurcharge(types, `/${ancien}`);
    }
    await copierGraphique(pieces, modele, graphique, "chart1.xml");
    const xml = retirerCadres(await lireTexte(modele, diapo(6)));
    modele.file(diapo(6), ajouterCadres(xml, cadres.map((c) => c.replace(/r:id="rId\d+"/, 'r:id="rId2"')), 100));
  }

  // ---- 7. KPI : cout du carton (le graphique remplace l'image)
  {
    const { cadres, graphique } = await cadresDeLaPiece(pieces, 3);
    if (!graphique) throw new Error("Graphique du cout du carton non genere.");
    await copierGraphique(pieces, modele, graphique, "chart2.xml");
    types = avecSurcharge(types, "/ppt/charts/chart2.xml", TYPE_GRAPHIQUE);
    const sansImage = retirerImage(await lireTexte(modele, diapo(7)), "Picture 2");
    const relations = retirerRelation(await lireTexte(modele, rels(7)), sansImage.relation);
    modele.file(rels(7), ajouterRelation(relations.rels, "rId20", TYPE_RELATION_GRAPHIQUE, "../charts/chart2.xml"));
    await supprimerImageInutilisee(modele, relations.cible);
    modele.file(diapo(7), ajouterCadres(sansImage.xml, cadres.map((c) => c.replace(/r:id="rId\d+"/, 'r:id="rId20"')), 100));
  }

  types = avecExtension(types, "xlsx", TYPE_CLASSEUR);
  modele.file("[Content_Types].xml", types);

  const sortie = await modele.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
  return sortie;
}

