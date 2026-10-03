import { supabaseServer } from "@/lib/supabase-server";

// Numerotation PERMANENTE des documents (voir
// scripts/sql/create_numerotation_permanente.sql). Un numero est attribue UNE
// fois a un document, enregistre dans document_numeros, et n'est jamais
// reattribue - meme si le document est supprime. Avant, ces codes etaient
// recalcules a chaque affichage selon l'ordre de creation : supprimer un
// document decalait les suivants, et un nouveau document pouvait reprendre un
// numero deja utilise.

export type DocKind =
  | "PL" // Historique programme : PL<n>.<annee>
  | "PD" // Historique Programme Dispatcher : PD<n>
  | "TE" // Mouvements produit fini : entree manuelle
  | "EP" // Mouvements produit fini : "Entree Production <n>"
  | "TS" // Mouvements produit fini : sortie
  | "MP_TE" // Mouvements matiere premiere : entree
  | "MP_TS" // Mouvements matiere premiere : sortie
  | "MP_TSA" // Mouvements matiere premiere : sortie admin
  | "CLAB"; // Lab : generation de codes

export type DocNumber = { annee: number; numero: number };
export type DocItem = { refId: number; annee?: number };

export function formatDocCode(kind: DocKind, doc: DocNumber): string {
  switch (kind) {
    case "PL":
      return `PL${doc.numero}.${doc.annee}`;
    case "PD":
      return `PD${doc.numero}`;
    case "TE":
    case "MP_TE":
      return `TE${doc.numero}`;
    case "EP":
      return `Entree Production ${doc.numero}`;
    case "TS":
    case "MP_TS":
      return `TS${doc.numero}`;
    case "MP_TSA":
      return `TSA${doc.numero}`;
    case "CLAB":
      return `CLAB${doc.numero}`;
  }
}

type RpcNumeroRow = { ref_id: number; annee: number; numero: number };

// 2e essai apres une courte pause si la base, tres sollicitee, depasse son
// delai maximum.
async function appelerRpc<T>(nom: string, args: Record<string, unknown>): Promise<T> {
  let { data, error } = await supabaseServer.rpc(nom, args);
  if (error) {
    await new Promise((resolve) => setTimeout(resolve, 600));
    ({ data, error } = await supabaseServer.rpc(nom, args));
  }
  if (error) {
    throw new Error(`Numerotation (${nom}) : ${error.message}`);
  }
  return data as T;
}

function versMap(rows: RpcNumeroRow[]): Map<number, DocNumber> {
  const map = new Map<number, DocNumber>();
  for (const row of rows) {
    map.set(Number(row.ref_id), { annee: Number(row.annee), numero: Number(row.numero) });
  }
  return map;
}

// Tous les numeros deja attribues pour ce type de document.
export async function lireNumeros(kind: DocKind): Promise<Map<number, DocNumber>> {
  return versMap(await appelerRpc<RpcNumeroRow[]>("document_lire_numeros", { p_kind: kind }));
}

// Renvoie le numero de chaque document de `items`. Les documents pas encore
// numerotes en recoivent un NOUVEAU, dans l'ordre fourni (ordre de creation),
// a la suite des numeros existants. Les numeros deja attribues ne changent
// jamais. `items` doit etre trie par ordre de creation.
export async function numeroter(kind: DocKind, items: DocItem[]): Promise<Map<number, DocNumber>> {
  const existants = await lireNumeros(kind);
  const manquants = items.filter((item) => !existants.has(item.refId));

  if (manquants.length > 0) {
    const TAILLE_LOT = 500;
    for (let debut = 0; debut < manquants.length; debut += TAILLE_LOT) {
      const lot = manquants.slice(debut, debut + TAILLE_LOT).map((item) => ({
        ref_id: item.refId,
        annee: item.annee ?? 0,
      }));
      const attribues = versMap(
        await appelerRpc<RpcNumeroRow[]>("document_attribuer_numeros", { p_kind: kind, p_items: lot })
      );
      for (const [refId, doc] of attribues) existants.set(refId, doc);
    }
  }

  return existants;
}

// Raccourci : codes affichables ("PL3.2026", "TE12"...) de chaque document.
export async function codesNumerotes(kind: DocKind, items: DocItem[]): Promise<Map<number, string>> {
  const numeros = await numeroter(kind, items);
  const codes = new Map<number, string>();
  for (const item of items) {
    const doc = numeros.get(item.refId);
    if (doc) codes.set(item.refId, formatDocCode(kind, doc));
  }
  return codes;
}

// Restauration d'un document supprime (Admin > Historique) : il retrouve son
// ANCIEN numero, meme si son identifiant interne a change. Sans effet si l'
// ancien document n'avait pas de numero, ou si le nouveau en a deja un.
export async function transfererNumero(kind: DocKind, ancienRefId: number, nouveauRefId: number): Promise<void> {
  if (!ancienRefId || !nouveauRefId || ancienRefId === nouveauRefId) return;

  const { data: dejaNumerote } = await supabaseServer
    .from("document_numeros")
    .select("ref_id")
    .eq("kind", kind)
    .eq("ref_id", nouveauRefId)
    .maybeSingle();
  if (dejaNumerote) return;

  const { error } = await supabaseServer
    .from("document_numeros")
    .update({ ref_id: nouveauRefId })
    .eq("kind", kind)
    .eq("ref_id", ancienRefId);
  if (error) {
    throw new Error(`Numerotation (transfert) : ${error.message}`);
  }
}

// Prochain numero d'un compteur simple (TO, TI, MB, IM...). `plancher` = plus
// grand numero deja existant : le compteur n'en repart jamais en dessous, et
// ne redescend jamais non plus si un document a ete supprime.
export async function prochainNumero(kind: string, annee = 0, plancher = 0): Promise<number> {
  return Number(
    await appelerRpc<number>("document_prochain_numero", {
      p_kind: kind,
      p_annee: annee,
      p_plancher: plancher,
    })
  );
}
