import { supabaseServer } from "@/lib/supabase-server";

// Transfer Order cree depuis la photo d'un TO d'un autre systeme : la photo est
// gardee pour reference (bucket prive, un fichier par TO : "<id du TO>.jpg"),
// et les noms lus sur la photo sont rapproches des articles de l'ERP.

export type ArticleTypePhoto = "MP" | "PF";

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
    }
  | { ok: false; message: string };

export const MAX_LIGNES_PHOTO = 60;
export const TAILLE_MAX_PHOTO_BASE64 = 7_000_000;

const BUCKET_PHOTOS_TO = "transfer-order-photos";

// ---------------------------------------------------------------- noms
export function normaliserNom(texte: string): string {
  return texte
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function mots(texte: string): Set<string> {
  return new Set(normaliserNom(texte).split(" ").filter(Boolean));
}

// 1 = memes mots (peu importe l'ordre) ; 0 = rien en commun
export function similariteNoms(a: string, b: string): number {
  const ma = mots(a);
  const mb = mots(b);
  if (ma.size === 0 || mb.size === 0) return 0;
  let communs = 0;
  for (const m of ma) if (mb.has(m)) communs += 1;
  return (2 * communs) / (ma.size + mb.size);
}

export type ArticleRapprochable = { id: number; nom: string };

// Cherche le nom lu dans les articles MP puis PF ; garde le plus ressemblant. Si plusieurs
// articles se ressemblent autant (ex: meme nom sauf la couleur), rien n'est pre-choisi :
// mieux vaut laisser l'utilisateur choisir que deviner le mauvais article.
export function rapprocherArticle(
  nomLu: string,
  articlesMp: ArticleRapprochable[],
  articlesPf: ArticleRapprochable[]
): Pick<LigneLuePhoto, "articleType" | "articleId" | "articleNom" | "statut"> {
  let meilleur: { type: ArticleTypePhoto; article: ArticleRapprochable; score: number } | null = null;
  let egalites = 0;

  for (const [type, liste] of [
    ["MP", articlesMp],
    ["PF", articlesPf],
  ] as const) {
    for (const article of liste) {
      const score = similariteNoms(nomLu, article.nom);
      if (score <= 0) continue;
      if (!meilleur || score > meilleur.score + 1e-9) {
        meilleur = { type, article, score };
        egalites = 1;
      } else if (Math.abs(score - meilleur.score) <= 1e-9) {
        egalites += 1;
      }
    }
  }

  if (!meilleur || meilleur.score < 0.8 || egalites > 1) {
    return { articleType: meilleur?.type ?? "MP", articleId: null, articleNom: "", statut: "introuvable" };
  }
  return {
    articleType: meilleur.type,
    articleId: meilleur.article.id,
    articleNom: meilleur.article.nom,
    statut: meilleur.score >= 0.999 ? "trouve" : "proche",
  };
}

// "Depot B", "depot b", "B", "DEPOT RD"... -> id du depot de l'ERP (null si pas reconnu)
export function rapprocherDepot(lu: string | null, depots: { id: number; nom: string }[]): number | null {
  if (!lu) return null;
  const cible = normaliserNom(lu);
  if (!cible) return null;
  const exact = depots.find((d) => normaliserNom(d.nom) === cible);
  if (exact) return exact.id;
  const parLettre = depots.filter((d) => normaliserNom(d.nom).replace(/^depot /, "") === cible.replace(/^depot /, ""));
  return parLettre.length === 1 ? parLettre[0].id : null;
}

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
