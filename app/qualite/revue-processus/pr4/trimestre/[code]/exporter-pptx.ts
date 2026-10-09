import PptxGenJS from "pptxgenjs";
import type { TrimestrePr4 } from "@/lib/trimestres-pr4";
import { LOGO_RODIS_PR4 } from "./logo-base64";
import { ajouterOrganigramme, ajouterProcedure } from "./pptx-diagrammes";
import { BLEU, HAUTEUR, LARGEUR, POLICE, POLICE_SURE, decor, titre } from "./pptx-commun";
import { PROCEDURES } from "./procedures-donnees";
import { INDICATEURS_DIAPO, estDansLaCible, lireIndicateursAnnee } from "./indicateurs-trimestre";
import { dernierMoisAffiche, lireKpiArretProduction, lireKpiCoutCarton } from "./kpi-donnees";
import { GROUPES_SWOT } from "./swot-donnees";

// PowerPoint du "Rapport de revue de processus PR4" d'un trimestre : memes diapositives que la page de l'ERP
// (page de garde, objectif, organigramme, procedures, indicateurs, KPI, SWOT, fin), avec de vrais objets PowerPoint
// (formes, tableaux, graphiques) - donc modifiables.
const CODE_DOCUMENT = "Code : CCSIQP-FO-031 Version : 1 Date 17/07/2023";
const VERT = "0B9A46";
const ROUGE = "E00000";

function pourcentage(valeur: number | null) {
  return valeur === null ? "-" : `${valeur.toLocaleString("fr-FR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
}

export async function construireRevuePptx(trimestre: TrimestrePr4): Promise<Buffer> {
  const pres = new PptxGenJS();
  pres.layout = "LAYOUT_WIDE";
  pres.title = `Rapport de revue de processus PR4 - ${trimestre.annee} / T${trimestre.trimestre}`;
  pres.author = "ERP Rodis";
  pres.company = "Rodis";

  const nouvelleDiapo = (variante: "garde" | "contenu" | "leger" = "contenu") => {
    const slide = pres.addSlide();
    slide.background = { color: "FFFFFF" };
    decor(slide, pres, variante);
    return slide;
  };

  // ------------------------------------------------------------ 1. page de garde
  {
    const slide = nouvelleDiapo("garde");
    slide.addImage({ data: LOGO_RODIS_PR4, x: LARGEUR * 0.405, y: HAUTEUR * 0.008, w: LARGEUR * 0.13, h: LARGEUR * 0.13 * (296 / 260) });
    slide.addText("Rapport de revue de\nprocessus PR4", {
      x: LARGEUR * 0.17,
      y: HAUTEUR * 0.37,
      w: LARGEUR * 0.64,
      h: HAUTEUR * 0.3,
      fontFace: POLICE,
      fontSize: 48,
      color: BLEU,
      align: "center",
      valign: "middle",
      margin: 0,
    });
    slide.addText(`${trimestre.annee} / T${trimestre.trimestre}`, {
      x: LARGEUR * 0.3,
      y: HAUTEUR * 0.8,
      w: LARGEUR * 0.37,
      h: 0.5,
      fontFace: POLICE,
      fontSize: 26,
      bold: true,
      color: "7F7F7F",
      align: "center",
      margin: 0,
    });
    slide.addText(CODE_DOCUMENT, { x: LARGEUR * 0.065, y: HAUTEUR * 0.895, w: 6, h: 0.3, fontFace: POLICE, fontSize: 10, color: "8C8C8C", margin: 0 });
  }

  // ------------------------------------------------------------ 2. objectif de la presentation
  {
    const slide = nouvelleDiapo("contenu");
    titre(slide, "Objectif de la présentation :", { taille: 40, x: 0.85, w: 11 });
    slide.addText(["→ Revue du processus PR4", "→ Lié aux exigences ISO 9001, 14001, 22716"].join("\n"), {
      x: 0.95,
      y: 3.4,
      w: 10,
      h: 1.0,
      fontFace: POLICE,
      fontSize: 22,
      color: "404040",
      valign: "middle",
      margin: 0,
    });
  }

  // ------------------------------------------------------------ 3. organigramme (ensemble + une diapositive par zone)
  ajouterOrganigramme(pres, () => nouvelleDiapo("leger"));

  // ------------------------------------------------------------ 4. schemas de procedures
  for (const procedure of PROCEDURES) {
    ajouterProcedure(pres, nouvelleDiapo("leger"), procedure);
  }

  // ------------------------------------------------------------ 5. indicateurs
  const trimestres = await lireIndicateursAnnee(trimestre.annee);
  const colonnes = trimestres.filter((t) => t.trimestre <= trimestre.trimestre);
  const courant = trimestres.find((t) => t.trimestre === trimestre.trimestre);
  {
    const slide = nouvelleDiapo("leger");
    titre(slide, "Indicateur", { taille: 34 });
    const entete = { bold: true, fill: { color: "F2F2F2" }, color: "111111", fontSize: 9, align: "center" as const, valign: "middle" as const };
    const rangees: PptxGenJS.TableRow[] = [
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
      const base = { fontSize: 7.5, align: "center" as const, valign: "middle" as const, color: "111111", fill: fond };
      rangees.push([
        { text: ind.indicateur, options: base },
        { text: ind.methode, options: base },
        { text: ind.cibleTexte, options: base },
        { text: ind.numero === 1 || ind.numero === 3 ? "" : "trimestrielle", options: base },
        ...colonnes.map((t) => {
          const valeur = t.valeurs[ind.numero];
          if (valeur === null || valeur === undefined) return { text: t.complet ? "-" : "", options: { ...base, color: "999999" } };
          const atteint = ind.cible ? estDansLaCible(ind.cible, valeur) : null;
          const texte = valeur.toLocaleString("fr-FR", { minimumFractionDigits: ind.decimales, maximumFractionDigits: ind.decimales });
          return {
            text: ind.pourcentage ? `${texte}%` : texte,
            options: { ...base, bold: true, color: atteint === null ? "111111" : atteint ? VERT : ROUGE },
          };
        }),
        { text: ind.planAction, options: { ...base, fontSize: 7, color: "1F4FB5" } },
      ]);
    }
    rangees.push([
      { text: "KPI atteints / KPI avec cible (indicateurs sans cible non comptés)", options: { bold: true, fontSize: 8, fill: { color: "F7F7F7" }, align: "left", valign: "middle", colspan: 4 } },
      ...colonnes.map((t) => ({ text: t.complet ? `${t.kpiOk} / ${t.kpiTotal}` : "", options: { bold: true, fontSize: 8, fill: { color: "F7F7F7" }, align: "center" as const, valign: "middle" as const } })),
      { text: "", options: { fill: { color: "F7F7F7" } } },
    ]);
    const largeurQuart = 0.8;
    const fixes = 2.0 + 2.5 + 1.0 + 0.9 + largeurQuart * colonnes.length;
    slide.addTable(rangees, {
      x: 0.35,
      y: 1.0,
      w: LARGEUR - 0.7,
      colW: [2.0, 2.5, 1.0, 0.9, ...colonnes.map(() => largeurQuart), Math.max(2, LARGEUR - 0.7 - fixes)],
      border: { type: "solid", color: "666666", pt: 0.5 },
      fontFace: POLICE_SURE,
      autoPage: true,
      autoPageRepeatHeader: true,
      newSlideStartY: 0.5,
      rowH: 0.3,
    });
  }
  if (courant) {
    const slide = nouvelleDiapo("leger");
    titre(slide, "Indicateur", { taille: 34 });
    slide.addText(
      [
        { text: "Indicateur : ", options: { color: "111111" } },
        { text: pourcentage(courant.pourcentageAtteint), options: { color: BLEU } },
        { text: " d'indicateur atteint", options: { color: "111111", breakLine: true } },
        { text: "Kpi ok : ", options: { color: "111111" } },
        { text: courant.complet ? String(courant.kpiOk) : "-", options: { color: VERT, breakLine: true } },
        { text: "Kpi totale : ", options: { color: "111111" } },
        { text: courant.complet ? String(courant.kpiTotal) : "-", options: { color: BLEU } },
      ],
      { x: 0.8, y: 2.0, w: 11, h: 3.4, fontFace: POLICE, fontSize: 40, valign: "middle", margin: 0 }
    );
    if (!courant.complet) {
      slide.addText(`Les chiffres de T${courant.trimestre} ${trimestre.annee} apparaissent quand le trimestre est terminé.`, {
        x: 0.8, y: 5.6, w: 11, h: 0.5, fontFace: POLICE_SURE, fontSize: 14, color: "666666", margin: 0,
      });
    }
  }

  // ------------------------------------------------------------ 6. KPI : temps d'arret et production realisee
  const dernierMois = dernierMoisAffiche(trimestre.annee, trimestre.trimestre);
  {
    const donnees = await lireKpiArretProduction(dernierMois);
    const slide = nouvelleDiapo("leger");
    titre(slide, "KPI", { taille: 36, w: 3 });
    slide.addText("% TEMPS D'ARRÊT ET PRODUCTION RÉALISÉE", { x: 3.2, y: 0.3, w: 9.5, h: 0.6, fontFace: POLICE, fontSize: 22, bold: true, color: "404040", align: "center", margin: 0 });
    const labels = donnees.categories.map((c) => (c ? `${c[0]} ${c[1]}` : " "));
    slide.addChart(
      pres.ChartType.line,
      [
        { name: "Production réalisée (%)", labels, values: donnees.production as number[] },
        { name: "Temps d'arrêt (%)", labels, values: donnees.arret as number[] },
      ],
      {
        x: 0.4, y: 1.0, w: LARGEUR - 0.8, h: HAUTEUR - 1.3,
        chartColors: ["ED7D31", "4472C4"],
        lineSize: 3,
        lineDataSymbolSize: 8,
        showLegend: true,
        legendPos: "t",
        legendFontSize: 12,
        valAxisMinVal: 0,
        valAxisMaxVal: 120,
        valAxisMajorUnit: 20,
        valAxisLabelFormatCode: '0"%"',
        valAxisLabelFontSize: 11,
        catAxisLabelFontSize: 10,
        showValue: true,
        dataLabelFormatCode: '0"%"',
        dataLabelFontSize: 10,
        dataLabelFontBold: true,
        dataLabelColor: "6F6F6F",
        dataLabelPosition: "t",
        displayBlanksAs: "gap",
        valGridLine: { color: "E1E1E1", size: 0.5 },
      } as PptxGenJS.IChartOpts
    );
  }

  // ------------------------------------------------------------ 7. KPI : cout du carton
  {
    const donnees = await lireKpiCoutCarton(trimestre.annee, dernierMois);
    const slide = nouvelleDiapo("leger");
    slide.addText("KPI – Analyse comparative du coût du carton (multi-sources)", { x: 0.5, y: 0.2, w: LARGEUR - 1, h: 0.6, fontFace: POLICE, fontSize: 24, color: "111111", align: "center", margin: 0 });
    slide.addText("variation coût de carton par mois", { x: 0.5, y: 0.8, w: LARGEUR - 1, h: 0.4, fontFace: POLICE, fontSize: 16, bold: true, color: "404040", align: "center", margin: 0 });
    const labels = donnees.categories.map((c) => `${c[0]} ${c[1]}`);
    const serie = (nom: string, valeurs: (number | null)[]) => ({ name: nom, labels, values: valeurs as number[] });
    slide.addChart(
      pres.ChartType.line,
      [
        serie("Coût carton / journalier totale", donnees.r1),
        serie("Coût carton / journalier cosmétique", donnees.r2),
        serie("Coût carton / journalier cosmétique et énergie cosmétique", donnees.r3),
        serie("Coût carton / coût journalier et énergie totale", donnees.r4),
        serie("Coût carton / coût journalier totale, embauches et énergie totale", donnees.r5),
        serie("nb carton fabriqué (÷ 100)", donnees.nbCarton),
        serie("Coût carton / énergie, salaire total et dépenses techniques", donnees.r6),
      ],
      {
        x: 0.4, y: 1.3, w: LARGEUR - 0.8, h: HAUTEUR - 1.6,
        chartColors: ["4A7EBB", "BE4B48", "98B954", "7D60A0", "46AAC5", "F79646", "2C4D75"],
        lineSize: 2.5,
        lineDataSymbolSize: 7,
        showLegend: true,
        legendPos: "b",
        legendFontSize: 10,
        valAxisMinVal: 0,
        valAxisLabelFormatCode: "#,##0",
        valAxisLabelFontSize: 10,
        catAxisLabelFontSize: 10,
        showValue: true,
        dataLabelFormatCode: "#,##0.0",
        dataLabelFontSize: 8,
        dataLabelFontBold: true,
        dataLabelPosition: "t",
        displayBlanksAs: "gap",
        valGridLine: { color: "E1E1E1", size: 0.5 },
      } as PptxGenJS.IChartOpts
    );
  }

  // ------------------------------------------------------------ 8. SWOT (3 diapositives, comme l original)
  {
    const entete = { bold: true, fill: { color: "808080" }, color: "FFFFFF", fontSize: 10, align: "center" as const, valign: "middle" as const };
    const ligneEntete: PptxGenJS.TableRow = [
      { text: "#", options: entete },
      { text: "SWOT", options: entete },
      { text: "Theme", options: entete },
      { text: "Description", options: entete },
      { text: "Objectif :", options: entete },
      { text: "Actions à mettre en place :", options: entete },
      { text: "Outils :", options: entete },
    ];
    const lignesGroupe = (groupe: (typeof GROUPES_SWOT)[number]): PptxGenJS.TableRow[] =>
      groupe.lignes.map((ligne, index) => {
        const base = { fontSize: 7.5, align: "center" as const, valign: "middle" as const, color: "111111", fill: { color: groupe.fond.replace("#", "").toUpperCase() } };
        return [
          { text: String(ligne.numero), options: { ...base, bold: true } },
          ...(index === 0 ? [{ text: groupe.libelle.join(" "), options: { ...base, bold: Boolean(groupe.libelleGras), rowspan: groupe.lignes.length } }] : []),
          { text: ligne.theme, options: { ...base, bold: Boolean(ligne.themeGras) } },
          { text: ligne.description, options: base },
          { text: ligne.objectif, options: base },
          { text: ligne.actions.join("\n"), options: base },
          { text: ligne.outils.join("\n"), options: base },
        ];
      });
    const parDiapo: { titre: boolean; cles: string[] }[] = [
      { titre: true, cles: ["forces", "faiblesses"] },
      { titre: false, cles: ["menaces"] },
      { titre: false, cles: ["opportunites"] },
    ];
    for (const diapo of parDiapo) {
      const slide = nouvelleDiapo("leger");
      if (diapo.titre) slide.addText("SWOT", { x: 0.5, y: 0.1, w: LARGEUR - 1, h: 0.8, fontFace: POLICE, fontSize: 40, color: BLEU, align: "center", margin: 0 });
      const rangees = [ligneEntete, ...GROUPES_SWOT.filter((g) => diapo.cles.includes(g.cle)).flatMap(lignesGroupe)];
      slide.addTable(rangees, {
        x: 0.3,
        y: diapo.titre ? 1.0 : 0.4,
        w: LARGEUR - 0.6,
        colW: [0.35, 0.85, 1.9, 2.8, 1.6, 3.4, 2.1],
        border: { type: "solid", color: "000000", pt: 0.5 },
        fontFace: POLICE_SURE,
        rowH: 0.3,
      });
    }
  }

  // ------------------------------------------------------------ 9. fin
  {
    const slide = nouvelleDiapo("contenu");
    slide.addText("Fin de la presentation", { x: 0.5, y: 0.3, w: 8, h: 0.5, fontFace: POLICE, fontSize: 22, color: "111111", margin: 0 });
    slide.addText("▶  Merci de votre attention", { x: 0.75, y: 1.8, w: 9, h: 0.6, fontFace: POLICE, fontSize: 24, color: "404040", margin: 0 });
    slide.addText("▶  Realise par:\n      Ayoub Mohamed", { x: 0.75, y: 5.6, w: 9, h: 1.2, fontFace: POLICE, fontSize: 24, color: "404040", margin: 0, valign: "top" });
  }

  const sortie = await pres.write({ outputType: "nodebuffer" });
  return sortie as Buffer;
}
