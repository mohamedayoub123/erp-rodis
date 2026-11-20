import { supabaseServer } from "@/lib/supabase-server";

// Livraison par client (Gestion Stock PF > Rapport) : tous les codes (lots) livres a un client, avec l'article, la quantite et les dates.
//
// Source : les SORTIES de lots_stock (qte_sortie > 0). Chaque sortie porte dans sa note une ligne
//   SORTIEWEB|date|code|livre pour|BL|preparateur|quantite|remarque|proforma      (livraison de commande ou sortie manuelle du web)
//   SORTIEIMPORT|date|-|livre pour|BL|preparateur|quantite                        (ancien historique importe du fichier Excel)
// Le "livre pour" est le client d'une livraison de commande, ou le nom tape sur une sortie manuelle (meme lecture que la trace des sorties
// de app/mouvements/shared.ts). Une note peut porter plusieurs lignes (un meme lot livre a plusieurs clients) : chaque ligne est lue.

export type OrigineLivraison = "Commande" | "Sortie manuelle" | "Import Excel";

export type LigneLivraison = {
  articleId: number;
  article: string;
  code: string;
  dateFabrication: string | null;
  // YYYY-MM-DD (date de la ligne SORTIE, sinon date du mouvement)
  dateLivraison: string | null;
  quantite: number;
  client: string;
  origine: OrigineLivraison;
};

export type LivraisonParCode = {
  cle: string;
  articleId: number;
  article: string;
  code: string;
  dateFabrication: string | null;
  quantite: number;
  nbLivraisons: number;
  // dates de livraison distinctes, de la plus ancienne a la plus recente
  dates: string[];
  // noms ecrits dans les livraisons (plusieurs seulement si le texte cherche correspond a plusieurs noms)
  clients: string[];
  origines: OrigineLivraison[];
};

export type SortieRow = {
  id: number;
  article_id: number | null;
  numero_lot: string | null;
  date_fabrication: string | null;
  date_jour: string | null;
  qte_sortie: number | null;
  note: string | null;
  source_import: string | null;
  articles: { nom_article: string } | { nom_article: string }[] | null;
};

type LigneNote = { importExcel: boolean; date: string | null; code: string; livrePour: string; quantite: number };

const DATE_ISO = /^\d{4}-\d{2}-\d{2}$/;

// Noms qui designent le MEME client. L'ancien fichier Excel notait le pays (GHANA) et le systeme note le client (UNIPARCO GHANA) : sans ce
// regroupement, les livraisons d'avril a juillet (Excel) et celles depuis aout (systeme) ne se retrouvaient pas dans la meme liste. Un groupe
// s'applique des que le texte cherche est contenu dans un de ses noms. A completer ici quand un autre client est ecrit de deux facons.
export const CLIENTS_REGROUPES: { noms: string[]; explication: string }[] = [
  {
    noms: ["UNIPARCO GHANA", "GHANA"],
    explication: "GHANA (ancien fichier Excel) et UNIPARCO GHANA (systeme) sont le meme client : leurs livraisons sont regroupees.",
  },
];

export function cleNom(value: string | null | undefined): string {
  return String(value ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

// Groupes de noms regroupes qui concernent le texte cherche
export function groupesDuTexte(recherche: string) {
  const cle = cleNom(recherche);
  if (!cle) return [];
  return CLIENTS_REGROUPES.filter((groupe) => groupe.noms.some((nom) => cleNom(nom).includes(cle)));
}

// Lignes SORTIEWEB / SORTIEIMPORT d'une note, chacune avec sa propre quantite
export function lignesSortieDeLaNote(note: string | null | undefined): LigneNote[] {
  const lignes: LigneNote[] = [];
  for (const brut of String(note ?? "").split(/\r?\n/)) {
    const ligne = brut.trim();
    const importExcel = ligne.startsWith("SORTIEIMPORT|");
    if (!importExcel && !ligne.startsWith("SORTIEWEB|")) continue;
    const parts = ligne.split("|");
    const livrePour = (parts[3] ?? "").trim();
    if (!livrePour || livrePour === "-") continue;
    const date = (parts[1] ?? "").trim();
    const code = (parts[2] ?? "").trim();
    lignes.push({
      importExcel,
      date: DATE_ISO.test(date) ? date : null,
      code: code && code !== "-" ? code : "",
      livrePour,
      quantite: Number(parts[6] ?? 0) || 0,
    });
  }
  return lignes;
}

function nomArticle(row: SortieRow): string {
  return (Array.isArray(row.articles) ? row.articles[0]?.nom_article : row.articles?.nom_article) || "-";
}

function origineDeLaLigne(ligne: LigneNote, row: SortieRow): OrigineLivraison {
  if (ligne.importExcel) return "Import Excel";
  return row.source_import === "web:sortie-commande" ? "Commande" : "Sortie manuelle";
}

// Lit toutes les livraisons dont le "livre pour" correspond au texte tape : le nom EXACT s'il existe (IPP ne ramene pas IPP SARL), sinon tous
// les noms qui contiennent le texte (CAPT ramene CAPTINO et CAPTIN CAMEROUN, chaque ligne garde son nom), toujours avec les noms regroupes
// (CLIENTS_REGROUPES). Un souci de lecture est renvoye dans error (les lignes deja lues restent).
export async function fetchLivraisonsClient(texte: string): Promise<{ lignes: LigneLivraison[]; error: string | null }> {
  const recherche = texte.trim();
  if (!recherche) return { lignes: [], error: null };

  // texte tape + noms regroupes (leurs notes ne contiennent pas forcement le texte tape)
  const textes = new Map<string, string>([[cleNom(recherche), recherche]]);
  for (const groupe of groupesDuTexte(recherche)) for (const nom of groupe.noms) textes.set(cleNom(nom), nom);

  const rows = new Map<number, SortieRow>();
  let error: string | null = null;
  for (const unTexte of textes.values()) {
    // % et _ sont des jokers du ilike : ils sont echappes pour etre cherches tels quels
    const motif = `%${unTexte.replace(/[\\%_]/g, "\\$&")}%`;
    let from = 0;
    const pageSize = 1000;
    while (true) {
      const { data, error: lectureError } = await supabaseServer
        .from("lots_stock")
        .select("id, article_id, numero_lot, date_fabrication, date_jour, qte_sortie, note, source_import, articles!inner(nom_article)")
        .gt("qte_sortie", 0)
        .ilike("note", motif)
        .order("id", { ascending: true })
        .range(from, from + pageSize - 1);
      if (lectureError) {
        error = lectureError.message;
        break;
      }
      const chunk = (data ?? []) as unknown as SortieRow[];
      for (const row of chunk) rows.set(row.id, row);
      if (chunk.length < pageSize) break;
      from += pageSize;
    }
    if (error) break;
  }
  return { lignes: construireLignes([...rows.values()], recherche), error };
}

export function construireLignes(rows: SortieRow[], recherche: string): LigneLivraison[] {
  const cle = cleNom(recherche);
  const clesRegroupees = new Set(groupesDuTexte(recherche).flatMap((groupe) => groupe.noms.map((nom) => cleNom(nom))));

  const candidates: { row: SortieRow; lignes: LigneNote[] }[] = [];
  let nomExact = false;
  for (const row of rows) {
    if (!row.article_id) continue;
    const toutes = lignesSortieDeLaNote(row.note);
    const retenues = toutes.filter((ligne) => clesRegroupees.has(cleNom(ligne.livrePour)) || cleNom(ligne.livrePour).includes(cle));
    if (retenues.length === 0) continue;
    if (retenues.some((ligne) => cleNom(ligne.livrePour) === cle)) nomExact = true;
    candidates.push({ row, lignes: toutes });
  }

  const resultat: LigneLivraison[] = [];
  for (const { row, lignes } of candidates) {
    const retenues = lignes.filter((ligne) => {
      const nom = cleNom(ligne.livrePour);
      return clesRegroupees.has(nom) || (nomExact ? nom === cle : nom.includes(cle));
    });
    for (const ligne of retenues) {
      // une seule ligne SORTIE dans la note : la quantite du mouvement fait foi (c'est ce qui est sorti du stock) ; plusieurs lignes (un meme lot
      // livre a plusieurs clients) : la quantite de chaque ligne
      const quantite = lignes.length === 1 ? Number(row.qte_sortie ?? 0) : ligne.quantite;
      if (!(quantite > 0)) continue;
      resultat.push({
        articleId: row.article_id as number,
        article: nomArticle(row),
        code: (row.numero_lot ?? "").trim() || ligne.code || "-",
        dateFabrication: row.date_fabrication,
        dateLivraison: ligne.date ?? row.date_jour,
        quantite,
        client: ligne.livrePour,
        origine: origineDeLaLigne(ligne, row),
      });
    }
  }
  return resultat;
}

// Filtre Mois (01 a 12) et Annee (AAAA) : vide = pas de limite de ce cote (mois seul = ce mois de toutes les annees, annee seule = toute
// l'annee). Une livraison sans date n'est gardee que sans filtre.
export function livraisonDansLaPeriode(ligne: LigneLivraison, mois: string, annee: string): boolean {
  if (!mois && !annee) return true;
  const date = ligne.dateLivraison ?? "";
  if (!DATE_ISO.test(date.slice(0, 10))) return false;
  if (annee && date.slice(0, 4) !== annee) return false;
  if (mois && date.slice(5, 7) !== mois) return false;
  return true;
}

export function grouperParCode(lignes: LigneLivraison[]): LivraisonParCode[] {
  const groupes = new Map<string, LivraisonParCode>();
  for (const ligne of lignes) {
    const cle = `${ligne.articleId}::${ligne.code.toUpperCase()}`;
    let groupe = groupes.get(cle);
    if (!groupe) {
      groupe = {
        cle,
        articleId: ligne.articleId,
        article: ligne.article,
        code: ligne.code,
        dateFabrication: null,
        quantite: 0,
        nbLivraisons: 0,
        dates: [],
        clients: [],
        origines: [],
      };
      groupes.set(cle, groupe);
    }
    groupe.quantite += ligne.quantite;
    groupe.nbLivraisons += 1;
    if (ligne.dateFabrication && (!groupe.dateFabrication || ligne.dateFabrication < groupe.dateFabrication)) {
      groupe.dateFabrication = ligne.dateFabrication;
    }
    if (ligne.dateLivraison && !groupe.dates.includes(ligne.dateLivraison)) groupe.dates.push(ligne.dateLivraison);
    if (!groupe.clients.some((nom) => cleNom(nom) === cleNom(ligne.client))) groupe.clients.push(ligne.client);
    if (!groupe.origines.includes(ligne.origine)) groupe.origines.push(ligne.origine);
  }
  // Ordre : par DATE DE LIVRAISON, la plus recente en premier (un code livre en plusieurs fois compte avec sa derniere livraison) ; a date
  // egale, par article puis par code. Les codes sans date de livraison sont en dernier.
  const derniereDate = (groupe: LivraisonParCode) => groupe.dates[groupe.dates.length - 1] ?? "";
  return [...groupes.values()]
    .map((groupe) => ({ ...groupe, dates: [...groupe.dates].sort() }))
    .sort(
      (a, b) =>
        derniereDate(b).localeCompare(derniereDate(a)) ||
        a.article.localeCompare(b.article, "fr", { sensitivity: "base" }) ||
        a.code.localeCompare(b.code, "fr", { sensitivity: "base", numeric: true })
    );
}

// Liste des articles livres (sans quantite ni code), du plus petit nom au plus grand, une seule fois chacun
export function articlesLivres(lignes: LigneLivraison[]): string[] {
  const noms = new Map<number, string>();
  for (const ligne of lignes) noms.set(ligne.articleId, ligne.article);
  return [...noms.values()].sort((a, b) => a.localeCompare(b, "fr", { sensitivity: "base" }));
}

// Noms proposes dans la liste du filtre client : la table des clients + les clients des commandes (une seule ecriture par nom, casse ignoree).
// Ce qui a ete tape a la main sur une sortie (PARAPHARM, MISE A JOUR STOCK...) reste cherchable en tapant le nom.
export async function fetchNomsClients(): Promise<string[]> {
  const noms = new Map<string, string>();
  const ajouter = (valeur: string | null | undefined) => {
    const nom = String(valeur ?? "").trim();
    if (nom && !noms.has(cleNom(nom))) noms.set(cleNom(nom), nom);
  };

  const { data: clients } = await supabaseServer.from("clients").select("nom_client").limit(2000);
  for (const row of (clients ?? []) as { nom_client: string | null }[]) ajouter(row.nom_client);

  let from = 0;
  const pageSize = 1000;
  while (true) {
    const { data, error } = await supabaseServer
      .from("commandes")
      .select("client")
      .order("id", { ascending: true })
      .range(from, from + pageSize - 1);
    if (error) break;
    const chunk = (data ?? []) as { client: string | null }[];
    for (const row of chunk) ajouter(row.client);
    if (chunk.length < pageSize) break;
    from += pageSize;
  }
  return [...noms.values()].sort((a, b) => a.localeCompare(b, "fr", { sensitivity: "base" }));
}
