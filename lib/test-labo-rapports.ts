import { supabaseServer } from "@/lib/supabase-server";

// Lecture des Tests labo (preparations passees au laboratoire) avec leur
// produit, date, type d'article, gamme et quantites COMMANDEES (PD). Partage par
// le Rapport Test labo et par la page Eau (Consommation par mois), pour que les
// deux affichent exactement les memes chiffres.

export type RapportRow = {
  id: number;
  programme_ligne_id: number;
  code: string;
  disposition_qualite: string | null;
  sous_derogation: boolean | null;
  utilisateur_test_labo: string | null;
  date_saisie_test_labo: string | null;
  date_prise_echantillon: string | null;
};

export type LigneInfo = {
  produit: string | null;
  date_jour: string | null;
  plateforme: string | null;
  article_id: number | null;
  // Quantites COMMANDEES (PD) de la ligne de programme, pas les quantites fabriquees
  vrac_a_fabriquer: number | null;
  qt_carton: number | null;
  numero_lot: string | null;
  numero_lot_detail: { code: string; qt_vrac: number | null; qt_carton: number | null }[] | null;
};

// Quantites commandees (PD) d'UN code : le detail du code quand la ligne est
// decoupee en plusieurs codes, sinon les quantites de la ligne (partagees a
// parts egales s'il y a plusieurs codes sans detail).
export function quantitesCommandees(ligne: LigneInfo | undefined, code: string): { kg: number; carton: number } {
  if (!ligne) return { kg: 0, carton: 0 };
  const entree = (ligne.numero_lot_detail ?? []).find((d) => d.code === code);
  if (entree) return { kg: Number(entree.qt_vrac ?? 0), carton: Number(entree.qt_carton ?? 0) };
  const nombreCodes = Math.max(1, (ligne.numero_lot || "").split(",").filter((c) => c.trim()).length);
  return {
    kg: Number(ligne.vrac_a_fabriquer ?? 0) / nombreCodes,
    carton: Number(ligne.qt_carton ?? 0) / nombreCodes,
  };
}

export async function fetchAllTestLaboRapports(): Promise<RapportRow[]> {
  const rows: RapportRow[] = [];
  let from = 0;
  const pageSize = 1000;

  while (true) {
    const { data, error } = await supabaseServer
      .from("production_rapports")
      .select(
        "id, programme_ligne_id, code, disposition_qualite, sous_derogation, utilisateur_test_labo, date_saisie_test_labo, date_prise_echantillon"
      )
      .not("utilisateur_test_labo", "is", null)
      .range(from, from + pageSize - 1);

    if (error) break;

    const chunk = (data ?? []) as RapportRow[];
    rows.push(...chunk);

    if (chunk.length < pageSize) break;
    from += pageSize;
  }

  return rows;
}

export async function fetchLignesInfo(ligneIds: number[]): Promise<Map<number, LigneInfo>> {
  const map = new Map<number, LigneInfo>();
  if (ligneIds.length === 0) return map;

  let from = 0;
  const pageSize = 1000;
  const uniqueIds = [...new Set(ligneIds)];

  while (from < uniqueIds.length) {
    const chunk = uniqueIds.slice(from, from + pageSize);
    const { data } = await supabaseServer
      .from("programme_lignes")
      .select("id, produit, date_jour, plateforme, article_id, vrac_a_fabriquer, qt_carton, numero_lot, numero_lot_detail")
      .in("id", chunk);

    for (const row of (data as (LigneInfo & { id: number })[] | null) ?? []) {
      map.set(row.id, {
        produit: row.produit,
        date_jour: row.date_jour,
        plateforme: row.plateforme,
        article_id: row.article_id,
        vrac_a_fabriquer: row.vrac_a_fabriquer,
        qt_carton: row.qt_carton,
        numero_lot: row.numero_lot,
        numero_lot_detail: row.numero_lot_detail,
      });
    }

    from += pageSize;
  }

  return map;
}

export type ArticleInfo = { type_article: string | null; gamme: string | null };

export async function fetchArticleInfos(articleIds: number[]): Promise<Map<number, ArticleInfo>> {
  const map = new Map<number, ArticleInfo>();
  if (articleIds.length === 0) return map;

  let from = 0;
  const pageSize = 1000;
  const uniqueIds = [...new Set(articleIds)];

  while (from < uniqueIds.length) {
    const chunk = uniqueIds.slice(from, from + pageSize);
    const { data } = await supabaseServer.from("articles").select("id, type_article, gamme").in("id", chunk);

    for (const row of (data as { id: number; type_article: string | null; gamme: string | null }[] | null) ?? []) {
      map.set(row.id, { type_article: row.type_article, gamme: row.gamme });
    }

    from += pageSize;
  }

  return map;
}

// "clarifiant" -> "Clarifiant" - meme normalisation que Ravitailleur par
// genre (articles.type_article est saisi a la main, casse pas toujours
// coherente).
export function capitalize(value: string | null | undefined) {
  const trimmed = (value || "").trim();
  if (!trimmed) return "-";
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1).toLowerCase();
}

// "Type" de preparation = Plateforme saisie sur Programme par ligne
// (colonne M/A) - le champ type_fabrication de la fiche Fabrication n'est
// pas rempli de facon fiable, contrairement a la Plateforme.
export function plateformeLabel(value: string | null | undefined) {
  if (value === "A") return "Auto";
  if (value === "M") return "Manuel";
  return "-";
}

// Toutes les preparations Test labo, dedoublonnees par code et enrichies (meme
// calcul que le Rapport Test labo avant filtres).
export async function lireLignesTestLabo() {
  const allRapportsRaw = await fetchAllTestLaboRapports();
  // Un meme numero de lot (code) peut se retrouver sur 2 "Programme par
  // ligne" differents (redispatche, correction...) - chacun avec sa propre
  // ligne production_rapports/Test labo. C'est physiquement LE MEME lot :
  // ne jamais le compter 2 fois dans les stats/graphes - demande explicite
  // ("pas conter 2 test sur le meme numero de lot, le prendre comme un
  // seul"). Garde la saisie la plus RECENTE par code (date_saisie_test_labo)
  // - un 2eme passage est plus probablement une correction/retest que la
  // 1ere saisie n'a pas a rester affichee a cote.
  const latestByCode = new Map<string, RapportRow>();
  for (const r of allRapportsRaw) {
    const current = latestByCode.get(r.code);
    if (!current || (r.date_saisie_test_labo || "") > (current.date_saisie_test_labo || "")) {
      latestByCode.set(r.code, r);
    }
  }
  const allRapports = [...latestByCode.values()];

  const lignesInfo = await fetchLignesInfo(allRapports.map((r) => r.programme_ligne_id));
  const articleInfos = await fetchArticleInfos(
    [...lignesInfo.values()].map((l) => l.article_id).filter((id): id is number => id !== null)
  );

  const allRows = allRapports.map((r) => {
    const ligne = lignesInfo.get(r.programme_ligne_id);
    const article = ligne?.article_id ? articleInfos.get(ligne.article_id) : undefined;
    return {
      ...r,
      produit: ligne?.produit || "-",
      // Priorite a la date de prise d'echantillon (saisie reelle du labo) sur
      // la date programmee - meme correctif que Historique Test Labo (voir
      // app/qualite/historique-test-labo/page.tsx), demande explicite pour
      // que les 2 pages restent coherentes entre elles.
      date:
        r.date_prise_echantillon ||
        ligne?.date_jour ||
        (r.date_saisie_test_labo ? r.date_saisie_test_labo.slice(0, 10) : ""),
      typeLabel: plateformeLabel(ligne?.plateforme),
      kgCommande: quantitesCommandees(ligne, r.code).kg,
      cartonCommande: quantitesCommandees(ligne, r.code).carton,
      typeArticleLabel: capitalize(article?.type_article),
      gammeLabel: article?.gamme?.trim() || "-",
    };
  });

  return allRows;
}
