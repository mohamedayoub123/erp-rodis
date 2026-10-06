import { supabaseServer } from "@/lib/supabase-server";
import type { ProgrammeLigneRow } from "../data";

export type ArticleOption = {
  id: number;
  nom_article: string;
  gamme: string | null;
  vrac_article_id: number | null;
};

export type CodeTermineStage = "vrac" | "carton" | "emballage" | "pesage" | "salle_conditionnement";

type EntryTotal = { programme_ligne_id: number; code: string; quantite: number };

type RpcPayload = {
  lignes: ProgrammeLigneRow[];
  carton: EntryTotal[];
  vrac: EntryTotal[];
  emballage: EntryTotal[];
  code_termine: { programme_ligne_id: number; code: string; stage: CodeTermineStage }[];
  reserves_en_attente: { programme_ligne_id: number; code: string; stage: "vrac" | "carton" }[];
  test_labo: { programme_ligne_id: number; code: string; utilisateur: string | null }[];
  pd_par_code: Record<string, string>;
  articles: ArticleOption[];
};

export type DashboardData = {
  lignes: ProgrammeLigneRow[];
  cartonByLigne: Map<number, EntryTotal[]>;
  vracByLigne: Map<number, EntryTotal[]>;
  emballageByLigne: Map<number, EntryTotal[]>;
  terminatedCodes: Set<string>;
  lignesAvecReserveEnAttente: Set<string>;
  // "ligneId::code" -> nom de qui a saisi le Test labo (affiche a cote du bouton).
  testLaboDoneKeys: Map<string, string>;
  pdLabelByCode: Map<string, string>;
  articles: ArticleOption[];
};

function groupByLigne(entries: EntryTotal[]): Map<number, EntryTotal[]> {
  const map = new Map<number, EntryTotal[]>();
  for (const entry of entries) {
    const list = map.get(entry.programme_ligne_id) ?? [];
    list.push(entry);
    map.set(entry.programme_ligne_id, list);
  }
  return map;
}

// Protection de la base : le Dashboard est lourd, et chaque affichage relancait la fonction SQL.
// - le meme resultat est reutilise pendant 5 s (par instance du serveur) ;
// - si plusieurs affichages arrivent en meme temps, ils partagent UN SEUL appel a la base.
// Un onglet qui se rechargerait en boucle, ou 10 personnes qui ouvrent le Dashboard ensemble, ne
// font plus 10 appels : la page garde au plus 5 s de retard (c'etait aussi la cause d'une base
// saturee quand un onglet bouclait ~2 fois par seconde).
const DUREE_CACHE_DASHBOARD_MS = 5_000;
let resultatDashboard: { jusqua: number; data: unknown } | null = null;
let appelDashboardEnCours: Promise<{ data: unknown; error: { message: string } | null }> | null = null;

async function lireDashboardRpc(): Promise<{ data: unknown; error: { message: string } | null }> {
  if (resultatDashboard && resultatDashboard.jusqua > Date.now()) return { data: resultatDashboard.data, error: null };
  if (appelDashboardEnCours) return appelDashboardEnCours;

  appelDashboardEnCours = (async () => {
    try {
      // Un 2e essai apres une courte pause : quand la base est tres sollicitee
      // (beaucoup d'utilisateurs en meme temps), une requete peut depasser le
      // delai maximum ("statement timeout") alors que la suivante passe sans
      // probleme - bug reel constate, le Dashboard affichait directement l'erreur.
      let { data, error } = await supabaseServer.rpc("dashboard_production_data");
      if (error || !data) {
        await new Promise((resolve) => setTimeout(resolve, 600));
        ({ data, error } = await supabaseServer.rpc("dashboard_production_data"));
      }
      if (!error && data) resultatDashboard = { jusqua: Date.now() + DUREE_CACHE_DASHBOARD_MS, data };
      return { data, error };
    } finally {
      appelDashboardEnCours = null;
    }
  })();

  return appelDashboardEnCours;
}

// Tout le Dashboard Production en UN aller-retour vers la base (voir
// scripts/sql/create_dashboard_production_data.sql) - avant, une dizaine de
// requetes paginees par 1000 lignes dont la plupart attendaient la fin de
// la precedente, soit ~3 s rien qu'en attente reseau avant meme de generer
// la page. Les entrees (carton/vrac/emballage) arrivent deja sommees par
// (ligne, code) : c'est tout ce que le Dashboard utilise.
export async function fetchDashboardData(): Promise<{ data: DashboardData | null; error: string | null }> {
  const { data, error } = await lireDashboardRpc();

  if (error || !data) {
    const timeout = /timeout|canceling statement/i.test(error?.message || "");
    return {
      data: null,
      error: timeout
        ? "la base de donnees a mis trop de temps a repondre (elle est tres sollicitee en ce moment). Reessaie dans quelques secondes."
        : error?.message || "Aucune donnee recue.",
    };
  }

  const payload = data as RpcPayload;

  // Date de programme puis creation decroissantes, comme avant - mais avec
  // l'id en dernier critere : plusieurs lignes enregistrees dans le meme
  // Save partagent exactement la meme date de creation, et leur ordre
  // changeait alors d'un chargement a l'autre, ce qui, avec l'affichage
  // limite aux plus recentes, aurait fait sauter des lignes d'un tableau a
  // l'autre.
  const lignes = [...payload.lignes].sort((a, b) => {
    if (a.date_jour !== b.date_jour) return a.date_jour < b.date_jour ? 1 : -1;
    if (a.created_at !== b.created_at) return a.created_at < b.created_at ? 1 : -1;
    return a.id - b.id;
  });

  return {
    error: null,
    data: {
      lignes,
      cartonByLigne: groupByLigne(payload.carton),
      vracByLigne: groupByLigne(payload.vrac),
      emballageByLigne: groupByLigne(payload.emballage),
      terminatedCodes: new Set(
        payload.code_termine.map((row) => `${row.programme_ligne_id}::${row.code}::${row.stage}`)
      ),
      lignesAvecReserveEnAttente: new Set(
        payload.reserves_en_attente.map((row) => `${row.programme_ligne_id}::${row.code}::${row.stage}`)
      ),
      testLaboDoneKeys: new Map(
        payload.test_labo.map((row) => [`${row.programme_ligne_id}::${row.code}`, row.utilisateur ?? ""] as [string, string])
      ),
      pdLabelByCode: new Map(Object.entries(payload.pd_par_code)),
      articles: payload.articles,
    },
  };
}
