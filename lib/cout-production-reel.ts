import { supabaseServer } from "@/lib/supabase-server";
import { fetchCoutsMoyenMp, computeRecetteCost, fetchCoutVracParKg } from "@/lib/prix-revient";
import { resolveVracArticleId } from "@/lib/vrac-article";
import { normalizeMachineName } from "@/lib/machine-match";
import { hhmmDiffMinutes, ddmmHhmmDiffMinutes } from "@/lib/suivi-tirage-time";
import { fetchAllVracEntries, fetchAllCartonEntries } from "@/app/production/suivi/data";

export type CoutReelPeriode = { dateFrom?: string; dateTo?: string; months?: string[] };

export type LigneIncertaine = { ligneId: number; code: string; motifs: string[] };

export type CoutReelResult = {
  articleId: number;
  nomArticle: string;
  nature: "vrac" | "fini";
  quantiteTotaleProduite: number;
  uniteQuantite: "kg" | "carton";
  coutVracReel: number | null;
  coutConditionnementReel: number | null;
  coutElectricite: number;
  coutJournaliers: number;
  coutTotal: number;
  coutParCarton: number | null;
  coutParPiece: number | null;
  coutParGramme: number | null;
  detailParMois: { mois: string; quantite: number; coutTotal: number }[];
  lignesIncertaines: LigneIncertaine[];
};

function round(value: number, decimals = 3) {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function moisDe(dateJour: string) {
  return dateJour.slice(0, 7);
}

function matchesPeriode(dateJour: string, periode: CoutReelPeriode) {
  if (periode.months && periode.months.length > 0) {
    return periode.months.includes(moisDe(dateJour));
  }
  if (periode.dateFrom && dateJour < periode.dateFrom) return false;
  if (periode.dateTo && dateJour > periode.dateTo) return false;
  return true;
}

type ProgrammeLigneRow = { id: number; chaine: string | null };
type ArticleRow = {
  id: number;
  nom_article: string;
  nature: string | null;
  vrac_article_id: number | null;
  vrac_quantite_recette: number | null;
  quantite_recette_base: number | null;
  contenance: number | null;
  piece_par_carton: number | null;
};
type RecetteLigneRow = { article_pf_id: number; article_mp_id: number; quantite: number };
type MachineRow = { id: number; nom: string; consommation_electrique_kw: number | null };
type PrixMoisRow = { annee: number; mois: number; prix_kwh: number | null; prix_heure_journalier: number | null };
type RapportCoutRow = {
  programme_ligne_id: number;
  code: string;
  machine: string | null;
  temps_debut_preparation: string | null;
  temps_vidange: string | null;
  temps_demarage_lot: string | null;
  temps_arret_batch: string | null;
  nb_journaliers_fabrication: number | null;
  nb_journaliers_conditionnement: number | null;
  date_fabrication_conditionnement: string | null;
};

async function fetchProgrammeLignesForArticle(articleId: number): Promise<ProgrammeLigneRow[]> {
  const rows: ProgrammeLigneRow[] = [];
  let from = 0;
  const pageSize = 1000;

  while (true) {
    const { data, error } = await supabaseServer
      .from("programme_lignes")
      .select("id, chaine")
      .eq("article_id", articleId)
      .range(from, from + pageSize - 1);

    if (error) break;
    const chunk = (data ?? []) as ProgrammeLigneRow[];
    rows.push(...chunk);
    if (chunk.length < pageSize) break;
    from += pageSize;
  }

  return rows;
}

async function fetchRecettesPfLignes(articlePfId: number): Promise<RecetteLigneRow[]> {
  const rows: RecetteLigneRow[] = [];
  let from = 0;
  const pageSize = 1000;

  while (true) {
    const { data, error } = await supabaseServer
      .from("recettes_pf")
      .select("article_pf_id, article_mp_id, quantite")
      .eq("article_pf_id", articlePfId)
      .range(from, from + pageSize - 1);

    if (error) break;
    const chunk = (data ?? []) as RecetteLigneRow[];
    rows.push(...chunk);
    if (chunk.length < pageSize) break;
    from += pageSize;
  }

  return rows;
}

async function fetchRapportsCout(ligneIds: number[]): Promise<RapportCoutRow[]> {
  if (ligneIds.length === 0) return [];

  const rows: RapportCoutRow[] = [];
  let from = 0;
  const pageSize = 1000;

  while (true) {
    const { data, error } = await supabaseServer
      .from("production_rapports")
      .select(
        "programme_ligne_id, code, machine, temps_debut_preparation, temps_vidange, temps_demarage_lot, temps_arret_batch, nb_journaliers_fabrication, nb_journaliers_conditionnement, date_fabrication_conditionnement"
      )
      .in("programme_ligne_id", ligneIds)
      .range(from, from + pageSize - 1);

    if (error) break;
    const chunk = (data ?? []) as RapportCoutRow[];
    rows.push(...chunk);
    if (chunk.length < pageSize) break;
    from += pageSize;
  }

  return rows;
}

async function fetchArticle(articleId: number): Promise<ArticleRow | null> {
  const { data } = await supabaseServer
    .from("articles")
    .select(
      "id, nom_article, nature, vrac_article_id, vrac_quantite_recette, quantite_recette_base, contenance, piece_par_carton"
    )
    .eq("id", articleId)
    .maybeSingle();
  return data as ArticleRow | null;
}

// Meme calcul (ratios) que la carte "Prix de revient" de
// recette-conditionnement/[id]/page.tsx, mais retourne les RATIOS par
// carton plutot qu'un total pour le lot theorique - ce module les multiplie
// ensuite par la quantite REELLEMENT produite sur la periode, pas par
// quantite_recette_base.
async function fetchRatiosConditionnement(article: ArticleRow) {
  const lignesConditionnement = await fetchRecettesPfLignes(article.id);

  const coutsMp = await fetchCoutsMoyenMp(lignesConditionnement.map((l) => l.article_mp_id));
  const { coutTotal: coutConditionnementLot, lignesSansPrix: lignesSansPrixConditionnement } = computeRecetteCost(
    lignesConditionnement,
    coutsMp
  );

  const quantiteBase = article.quantite_recette_base;
  const coutConditionnementParCarton =
    quantiteBase && quantiteBase > 0 ? coutConditionnementLot / quantiteBase : null;

  const qtVracAuto =
    article.contenance && article.piece_par_carton
      ? round((quantiteBase || 1) * article.piece_par_carton * article.contenance, 3)
      : null;
  const qtVracNecessaire = article.vrac_quantite_recette ?? qtVracAuto;
  const qtVracParCarton = quantiteBase && quantiteBase > 0 && qtVracNecessaire ? qtVracNecessaire / quantiteBase : null;

  return {
    coutConditionnementParCarton,
    qtVracParCarton,
    lignesSansPrixConditionnement: lignesSansPrixConditionnement.length > 0,
  };
}

async function fetchPrixMoisMap(mois: string[]): Promise<Map<string, PrixMoisRow>> {
  const map = new Map<string, PrixMoisRow>();
  if (mois.length === 0) return map;

  const annees = [...new Set(mois.map((m) => Number(m.slice(0, 4))))];
  const { data } = await supabaseServer
    .from("prix_carburant")
    .select("annee, mois, prix_kwh, prix_heure_journalier")
    .in("annee", annees);

  for (const row of (data ?? []) as PrixMoisRow[]) {
    map.set(`${row.annee}-${String(row.mois).padStart(2, "0")}`, row);
  }
  return map;
}

export async function computeCoutReelArticle(
  articleId: number,
  periode: CoutReelPeriode
): Promise<CoutReelResult> {
  const article = await fetchArticle(articleId);
  if (!article) {
    throw new Error("Article introuvable.");
  }

  const nature: "vrac" | "fini" = article.nature === "vrac" ? "vrac" : "fini";
  const uniteQuantite: "kg" | "carton" = nature === "vrac" ? "kg" : "carton";

  const lignesProgramme = await fetchProgrammeLignesForArticle(articleId);
  const ligneIds = lignesProgramme.map((l) => l.id);
  const chaineByLigneId = new Map(lignesProgramme.map((l) => [l.id, l.chaine]));

  const lignesIncertaines: LigneIncertaine[] = [];
  const detailParMoisMap = new Map<string, { quantite: number; coutTotal: number }>();

  if (ligneIds.length === 0) {
    return {
      articleId,
      nomArticle: article.nom_article,
      nature,
      quantiteTotaleProduite: 0,
      uniteQuantite,
      coutVracReel: null,
      coutConditionnementReel: null,
      coutElectricite: 0,
      coutJournaliers: 0,
      coutTotal: 0,
      coutParCarton: null,
      coutParPiece: null,
      coutParGramme: null,
      detailParMois: [],
      lignesIncertaines: [],
    };
  }

  // Quantite reellement produite : vrac fabrique pour un article de nature
  // "vrac", sinon TOUJOURS les cartons du Conditionnement (jamais
  // l'Emballage, decision actee avec l'utilisateur).
  const entriesRaw =
    nature === "vrac" ? await fetchAllVracEntries(ligneIds) : await fetchAllCartonEntries(ligneIds);
  const entries = entriesRaw.filter((e) => matchesPeriode(e.date_jour, periode));
  const quantiteTotaleProduite = entries.reduce((sum, e) => sum + Number(e.quantite ?? 0), 0);

  // Cout vrac/conditionnement REEL = ratio de la recette (deja base sur les
  // vrais prix MP moyens ponderes) x quantite REELLEMENT produite - pas la
  // quantite theorique du lot (decision actee avec l'utilisateur). Calcule
  // aussi un cout PAR UNITE (kg ou carton, vrac+conditionnement combines)
  // pour pouvoir l'attribuer au mois de chaque entree reelle dans
  // detailParMois juste apres.
  let coutVracReel: number | null = null;
  let coutConditionnementReel: number | null = null;
  let coutParUnite: number | null = null;

  if (nature === "vrac") {
    const coutVrac = await fetchCoutVracParKg(articleId);
    coutParUnite = coutVrac.coutParKg;
    coutVracReel = coutVrac.coutParKg !== null ? coutVrac.coutParKg * quantiteTotaleProduite : null;
    if (coutVrac.coutParKg === null) {
      lignesIncertaines.push({ ligneId: 0, code: "", motifs: ["Cout par kg du vrac inconnu (MP sans prix)."] });
    }
  } else {
    const vracArticleId = await resolveVracArticleId(articleId);
    const { coutConditionnementParCarton, qtVracParCarton, lignesSansPrixConditionnement } =
      await fetchRatiosConditionnement(article);

    coutConditionnementReel =
      coutConditionnementParCarton !== null ? coutConditionnementParCarton * quantiteTotaleProduite : null;
    if (coutConditionnementParCarton === null) {
      lignesIncertaines.push({
        ligneId: 0,
        code: "",
        motifs: ["Cout de conditionnement inconnu (quantite_recette_base non renseignee)."],
      });
    } else if (lignesSansPrixConditionnement) {
      lignesIncertaines.push({
        ligneId: 0,
        code: "",
        motifs: ["Certains articles de conditionnement n'ont pas de prix connu - cout partiel."],
      });
    }

    let coutVracParCarton: number | null = null;
    if (vracArticleId) {
      const coutVrac = await fetchCoutVracParKg(vracArticleId);
      coutVracParCarton =
        coutVrac.coutParKg !== null && qtVracParCarton !== null ? coutVrac.coutParKg * qtVracParCarton : null;
      coutVracReel = coutVracParCarton !== null ? coutVracParCarton * quantiteTotaleProduite : null;
      if (coutVrac.coutParKg === null || qtVracParCarton === null) {
        lignesIncertaines.push({
          ligneId: 0,
          code: "",
          motifs: ["Cout du vrac utilise inconnu (prix MP ou quantite de vrac necessaire manquants)."],
        });
      }
    }

    coutParUnite =
      coutConditionnementParCarton !== null || coutVracParCarton !== null
        ? (coutConditionnementParCarton ?? 0) + (coutVracParCarton ?? 0)
        : null;
  }

  for (const entry of entries) {
    const quantite = Number(entry.quantite ?? 0);
    const mois = moisDe(entry.date_jour);
    const current = detailParMoisMap.get(mois) ?? { quantite: 0, coutTotal: 0 };
    current.quantite += quantite;
    current.coutTotal += coutParUnite !== null ? coutParUnite * quantite : 0;
    detailParMoisMap.set(mois, current);
  }

  // Electricite + journaliers : uniquement pour les lots (programme_ligne,
  // code) qui ont reellement produit sur la periode (memes entrees que
  // ci-dessus) - un rapport de production existe pour chaque lot reel.
  const codeKeys = new Set(entries.map((e) => `${e.programme_ligne_id}::${e.code}`));

  const rapports = await fetchRapportsCout(ligneIds);
  const rapportsPertinents = rapports.filter((r) => codeKeys.has(`${r.programme_ligne_id}::${r.code}`));

  const { data: machinesData } = await supabaseServer
    .from("machines")
    .select("id, nom, consommation_electrique_kw");
  const machineByName = new Map(
    ((machinesData ?? []) as MachineRow[]).map((m) => [normalizeMachineName(m.nom), m])
  );

  const moisUtiles = [
    ...new Set(rapportsPertinents.map((r) => r.date_fabrication_conditionnement).filter((d): d is string => !!d)),
  ].map((d) => moisDe(d));
  const prixMoisByKey = await fetchPrixMoisMap(moisUtiles);

  let coutElectricite = 0;
  let coutJournaliers = 0;

  for (const rapport of rapportsPertinents) {
    const anneeRef = rapport.date_fabrication_conditionnement
      ? Number(rapport.date_fabrication_conditionnement.slice(0, 4))
      : new Date().getFullYear();
    const prixMois = rapport.date_fabrication_conditionnement
      ? prixMoisByKey.get(moisDe(rapport.date_fabrication_conditionnement))
      : undefined;
    const motifs: string[] = [];
    let coutRapportCourant = 0;

    // Poste Fabrication (temps "JJ/MM HH:MM" - peut s'etaler sur plusieurs
    // jours). Temps machine = tout l'intervalle Debut preparation -> Vidange
    // (decision actee, y compris l'attente du test labo).
    if (rapport.temps_debut_preparation && rapport.temps_vidange) {
      const minutes = ddmmHhmmDiffMinutes(rapport.temps_debut_preparation, rapport.temps_vidange, anneeRef);
      if (minutes === null) {
        motifs.push("Temps de fabrication invalide.");
      } else {
        const heures = minutes / 60;
        const machine = rapport.machine ? machineByName.get(normalizeMachineName(rapport.machine)) : null;
        if (!machine || machine.consommation_electrique_kw === null) {
          motifs.push(`Machine de fabrication "${rapport.machine || "-"}" introuvable ou sans kW renseigne.`);
        } else if (!prixMois || prixMois.prix_kwh === null) {
          motifs.push("Prix electricite (par kWh) non renseigne pour ce mois.");
        } else {
          const cout = machine.consommation_electrique_kw * heures * prixMois.prix_kwh;
          coutElectricite += cout;
          coutRapportCourant += cout;
        }

        if (rapport.nb_journaliers_fabrication === null) {
          motifs.push("Nombre de journaliers Fabrication non renseigne.");
        } else if (!prixMois || prixMois.prix_heure_journalier === null) {
          motifs.push("Prix de l'heure journaliere non renseigne pour ce mois.");
        } else {
          const cout = rapport.nb_journaliers_fabrication * heures * prixMois.prix_heure_journalier;
          coutJournaliers += cout;
          coutRapportCourant += cout;
        }
      }
    }

    // Poste Conditionnement (temps "HH:MM" simple). Machine rapprochee via
    // programme_lignes.chaine (pas de champ machine libre pour ce poste).
    if (rapport.temps_demarage_lot && rapport.temps_arret_batch) {
      const minutes = hhmmDiffMinutes(rapport.temps_demarage_lot, rapport.temps_arret_batch);
      const heures = minutes / 60;
      const chaine = chaineByLigneId.get(rapport.programme_ligne_id);
      const machine = chaine ? machineByName.get(normalizeMachineName(chaine)) : null;
      if (!machine || machine.consommation_electrique_kw === null) {
        motifs.push(`Machine de conditionnement "${chaine || "-"}" introuvable ou sans kW renseigne.`);
      } else if (!prixMois || prixMois.prix_kwh === null) {
        motifs.push("Prix electricite (par kWh) non renseigne pour ce mois.");
      } else {
        const cout = machine.consommation_electrique_kw * heures * prixMois.prix_kwh;
        coutElectricite += cout;
        coutRapportCourant += cout;
      }

      if (rapport.nb_journaliers_conditionnement === null) {
        motifs.push("Nombre de journaliers Conditionnement non renseigne.");
      } else if (!prixMois || prixMois.prix_heure_journalier === null) {
        motifs.push("Prix de l'heure journaliere non renseigne pour ce mois.");
      } else {
        const cout = rapport.nb_journaliers_conditionnement * heures * prixMois.prix_heure_journalier;
        coutJournaliers += cout;
        coutRapportCourant += cout;
      }
    }

    if (motifs.length > 0) {
      lignesIncertaines.push({ ligneId: rapport.programme_ligne_id, code: rapport.code, motifs });
    }

    if (rapport.date_fabrication_conditionnement && coutRapportCourant > 0) {
      const mois = moisDe(rapport.date_fabrication_conditionnement);
      const current = detailParMoisMap.get(mois) ?? { quantite: 0, coutTotal: 0 };
      current.coutTotal += coutRapportCourant;
      detailParMoisMap.set(mois, current);
    }
  }

  const coutTotal = (coutVracReel ?? 0) + (coutConditionnementReel ?? 0) + coutElectricite + coutJournaliers;

  const coutParCarton =
    nature === "fini" && quantiteTotaleProduite > 0 ? coutTotal / quantiteTotaleProduite : null;
  const coutParPiece =
    coutParCarton !== null && article.piece_par_carton ? coutParCarton / article.piece_par_carton : null;
  const coutParGramme =
    nature === "vrac"
      ? quantiteTotaleProduite > 0
        ? coutTotal / (quantiteTotaleProduite * 1000)
        : null
      : coutParPiece !== null && article.contenance
        ? coutParPiece / (article.contenance * 1000)
        : null;

  const detailParMois = [...detailParMoisMap.entries()]
    .map(([mois, v]) => ({ mois, quantite: round(v.quantite, 2), coutTotal: Math.round(v.coutTotal) }))
    .sort((a, b) => a.mois.localeCompare(b.mois));

  return {
    articleId,
    nomArticle: article.nom_article,
    nature,
    quantiteTotaleProduite: round(quantiteTotaleProduite, 2),
    uniteQuantite,
    coutVracReel: coutVracReel !== null ? Math.round(coutVracReel) : null,
    coutConditionnementReel: coutConditionnementReel !== null ? Math.round(coutConditionnementReel) : null,
    coutElectricite: Math.round(coutElectricite),
    coutJournaliers: Math.round(coutJournaliers),
    coutTotal: Math.round(coutTotal),
    coutParCarton,
    coutParPiece,
    coutParGramme,
    detailParMois,
    lignesIncertaines,
  };
}
