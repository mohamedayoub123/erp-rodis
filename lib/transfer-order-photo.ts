import { randomUUID } from "node:crypto";
import { supabaseServer } from "@/lib/supabase-server";

// Transfer Order cree depuis la photo d'un TO d'un autre systeme : la photo est
// gardee pour reference (bucket prive, un fichier par TO : "<id du TO>.jpg"),
// et les noms lus sur la photo sont rapproches des articles de l'ERP.

import type { ArticleTypePhoto } from "@/lib/noms-articles";

// Le rapprochement des noms (fonctions pures) est dans lib/noms-articles.ts
export type { ArticleRapprochable, ArticleTypePhoto } from "@/lib/noms-articles";
export { normaliserNom, preparerArticles, rapprocherArticle, rapprocherDepot } from "@/lib/noms-articles";

export type LigneLuePhoto = {
  cle: number;
  nomLu: string;
  quantite: number | null;
  unite: string | null;
  articleType: ArticleTypePhoto;
  articleId: number | null;
  articleNom: string;
  // trouve = meme nom ; proche = nom ressemblant (a verifier) ; introuvable = a choisir a la main
  statut: "trouve" | "proche" | "introuvable";
};

export type LecturePhotoTransferOrder =
  | {
      ok: true;
      date: string | null;
      numeroDocument: string | null;
      depotSourceId: number | null;
      depotDestinationId: number | null;
      depotSourceLu: string | null;
      depotDestinationLu: string | null;
      lignes: LigneLuePhoto[];
      // Listes pour choisir un article a la main a l'ecran de verification (evite de les charger a l'ouverture de la page)
      articlesMp: { id: number; label: string }[];
      articlesPf: { id: number; label: string }[];
      // Photo deja gardee cote serveur pendant la lecture : a la creation, le telephone n'a pas a la renvoyer
      photoTemp: string | null;
    }
  | { ok: false; message: string };

export const MAX_LIGNES_PHOTO = 60;
export const TAILLE_MAX_PHOTO_BASE64 = 7_000_000;

const BUCKET_PHOTOS_TO = "transfer-order-photos";

// ---------------------------------------------------------------- photo gardee
let bucketPret = false;

async function assurerBucket() {
  if (bucketPret) return;
  const { data: buckets } = await supabaseServer.storage.listBuckets();
  if (!buckets?.some((b) => b.name === BUCKET_PHOTOS_TO)) {
    const { error } = await supabaseServer.storage.createBucket(BUCKET_PHOTOS_TO, {
      public: false,
      fileSizeLimit: 8 * 1024 * 1024,
    });
    if (error && !/already exists/i.test(error.message)) throw new Error(error.message);
  }
  bucketPret = true;
}

function cheminPhoto(transferOrderId: number) {
  return `${transferOrderId}.jpg`;
}

// Garde la photo jointe a ce TO (best effort : le TO est deja cree quand on arrive ici)
export async function sauverPhotoTransferOrder(transferOrderId: number, jpeg: Buffer): Promise<boolean> {
  try {
    await assurerBucket();
    const { error } = await supabaseServer.storage
      .from(BUCKET_PHOTOS_TO)
      .upload(cheminPhoto(transferOrderId), jpeg, { contentType: "image/jpeg", upsert: true });
    return !error;
  } catch {
    return false;
  }
}

// Lien temporaire (1 h) vers la photo du TO, ou null s'il n'y en a pas
export async function urlPhotoTransferOrder(transferOrderId: number): Promise<string | null> {
  try {
    const { data, error } = await supabaseServer.storage
      .from(BUCKET_PHOTOS_TO)
      .createSignedUrl(cheminPhoto(transferOrderId), 3600);
    return error ? null : (data?.signedUrl ?? null);
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------- photo temporaire
// La photo est gardee cote serveur des la LECTURE (le serveur la recoit deja) : a la creation du TO,
// il suffit de la renommer, au lieu de la faire renvoyer par le telephone (lent en connexion mobile).
const FORMAT_CHEMIN_TEMP = /^tmp\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.jpg$/;

export function cheminTemporaireValide(chemin: string): boolean {
  return FORMAT_CHEMIN_TEMP.test(chemin);
}

export async function sauverPhotoTemporaire(jpeg: Buffer): Promise<string | null> {
  try {
    await assurerBucket();
    const chemin = `tmp/${randomUUID()}.jpg`;
    const { error } = await supabaseServer.storage
      .from(BUCKET_PHOTOS_TO)
      .upload(chemin, jpeg, { contentType: "image/jpeg", upsert: false });
    return error ? null : chemin;
  } catch {
    return null;
  }
}

// Rattache la photo temporaire au TO cree (renommage cote stockage : instantane)
export async function rattacherPhotoTemporaire(chemin: string, transferOrderId: number): Promise<boolean> {
  if (!cheminTemporaireValide(chemin)) return false;
  try {
    const { error } = await supabaseServer.storage
      .from(BUCKET_PHOTOS_TO)
      .move(chemin, cheminPhoto(transferOrderId));
    return !error;
  } catch {
    return false;
  }
}

// Efface les photos temporaires de plus de 24 h (lecture jamais suivie d'une creation)
export async function nettoyerPhotosTemporaires(): Promise<void> {
  try {
    const { data } = await supabaseServer.storage.from(BUCKET_PHOTOS_TO).list("tmp", { limit: 200 });
    const limite = Date.now() - 24 * 3600 * 1000;
    const anciens = (data ?? [])
      .filter((f) => f.created_at && new Date(f.created_at).getTime() < limite)
      .map((f) => `tmp/${f.name}`);
    if (anciens.length > 0) await supabaseServer.storage.from(BUCKET_PHOTOS_TO).remove(anciens);
  } catch {
    // sans importance : on reessaiera a la prochaine lecture
  }
}

export async function supprimerPhotoTemporaire(chemin: string | null | undefined): Promise<void> {
  if (!chemin || !cheminTemporaireValide(chemin)) return;
  try {
    await supabaseServer.storage.from(BUCKET_PHOTOS_TO).remove([chemin]);
  } catch {
    // une photo temporaire orpheline ne gene personne
  }
}
