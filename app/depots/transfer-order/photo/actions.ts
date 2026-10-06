"use server";

import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import { canWritePageUser, getCurrentStockUser } from "@/lib/stock-auth";
import { lireTransferOrderSurPhoto } from "@/lib/transfer-order-photo-lecture";
import {
  MAX_LIGNES_PHOTO,
  TAILLE_MAX_PHOTO_BASE64,
  rapprocherArticle,
  rapprocherDepot,
  sauverPhotoTransferOrder,
  type ArticleRapprochable,
  type ArticleTypePhoto,
  type LecturePhotoTransferOrder,
} from "@/lib/transfer-order-photo";
import { createTransferOrder } from "../actions";

type Reponse<T> = ({ ok: true } & T) | { ok: false; message: string };

async function lireNomsArticles(table: "articles_matiere_premiere" | "articles"): Promise<ArticleRapprochable[]> {
  const resultat: ArticleRapprochable[] = [];
  for (let debut = 0; ; debut += 1000) {
    const { data, error } = await supabaseServer
      .from(table)
      .select("id, nom_article")
      .order("id", { ascending: true })
      .range(debut, debut + 999);
    if (error) throw new Error(error.message);
    const page = (data ?? []) as { id: number; nom_article: string | null }[];
    for (const a of page) if (a.nom_article) resultat.push({ id: a.id, nom: a.nom_article });
    if (page.length < 1000) break;
  }
  return resultat;
}

// Lit la photo (IA) puis rapproche chaque nom d'article de ceux de l'ERP. Ne cree rien :
// l'utilisateur verifie la liste avant la creation. Retourne {ok, message} (jamais de throw :
// Next.js efface le message d'une Error jetee depuis une Server Action en production).
export async function lirePhotoTransferOrderAction(imageBase64: string): Promise<LecturePhotoTransferOrder> {
  try {
    const utilisateur = await getCurrentStockUser();
    if (!(await canWritePageUser(utilisateur, "depots"))) {
      return { ok: false, message: "Cet utilisateur ne peut pas creer de Transfer Order." };
    }

    const image = String(imageBase64 || "");
    if (!image) return { ok: false, message: "Choisis d'abord une photo." };
    if (image.length > TAILLE_MAX_PHOTO_BASE64) return { ok: false, message: "La photo est trop lourde." };

    let extraction;
    try {
      // Le navigateur envoie toujours un JPEG (photo reduite avant l'envoi)
      extraction = await lireTransferOrderSurPhoto(image, "image/jpeg");
    } catch (error) {
      if (error instanceof Error && error.message === "CLE_ANTHROPIC_ABSENTE") {
        return {
          ok: false,
          message:
            "La lecture par photo n'est pas encore activee : il manque la cle ANTHROPIC_API_KEY dans les reglages de Vercel.",
        };
      }
      const detail = error instanceof Error ? error.message : "erreur inconnue";
      return { ok: false, message: `La lecture de la photo a echoue (${detail}). Reessaie avec une photo plus nette.` };
    }

    if (extraction.lignes.length === 0) {
      return { ok: false, message: "Aucun article n'a ete lu sur cette photo. Reessaie avec une photo plus nette." };
    }

    const [articlesMp, articlesPf, { data: depotsData }] = await Promise.all([
      lireNomsArticles("articles_matiere_premiere"),
      lireNomsArticles("articles"),
      supabaseServer.from("depots").select("id, nom"),
    ]);
    const depots = (depotsData ?? []) as { id: number; nom: string }[];

    const date = extraction.date && /^\d{4}-\d{2}-\d{2}$/.test(extraction.date) ? extraction.date : null;

    return {
      ok: true,
      date,
      numeroDocument: extraction.numeroDocument,
      depotSourceId: rapprocherDepot(extraction.depotSource, depots),
      depotDestinationId: rapprocherDepot(extraction.depotDestination, depots),
      depotSourceLu: extraction.depotSource,
      depotDestinationLu: extraction.depotDestination,
      lignes: extraction.lignes.slice(0, MAX_LIGNES_PHOTO).map((ligne, index) => ({
        cle: index,
        nomLu: ligne.nom,
        quantite: ligne.quantite,
        unite: ligne.unite,
        ...rapprocherArticle(ligne.nom, articlesMp, articlesPf),
      })),
    };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Lecture impossible." };
  }
}

type LigneACreer = { articleType: ArticleTypePhoto; articleId: number; quantite: number };

// Cree le Transfer Order (en attente, comme un TO normal : meme controle du stock du depot
// source) puis garde la photo en piece jointe.
export async function creerTransferOrderDepuisPhotoAction(params: {
  date: string;
  depotSourceId: number;
  depotDestinationId: number;
  remarque: string;
  lignes: LigneACreer[];
  imageBase64: string;
}): Promise<Reponse<{ transferOrderId: number; photoJointe: boolean }>> {
  try {
    const utilisateur = await getCurrentStockUser();
    if (!(await canWritePageUser(utilisateur, "depots"))) {
      return { ok: false, message: "Cet utilisateur ne peut pas creer de Transfer Order." };
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(params.date)) return { ok: false, message: "Choisis une date valide." };
    if (!Array.isArray(params.lignes) || params.lignes.length === 0) {
      return { ok: false, message: "Ajoute au moins un article avec une quantite." };
    }
    if (params.lignes.length > MAX_LIGNES_PHOTO) {
      return { ok: false, message: `Maximum ${MAX_LIGNES_PHOTO} articles.` };
    }

    // Un meme article lu sur 2 lignes = une seule ligne de TO (quantites additionnees)
    const regroupees = new Map<string, { articleType: ArticleTypePhoto; articleId: number; quantiteDemandee: number }>();
    for (const [i, ligne] of params.lignes.entries()) {
      const type: ArticleTypePhoto = ligne.articleType === "PF" ? "PF" : "MP";
      const articleId = Number(ligne.articleId);
      const quantite = Number(ligne.quantite);
      if (!Number.isInteger(articleId) || articleId <= 0) {
        return { ok: false, message: `Ligne ${i + 1} : choisis l'article de l'ERP.` };
      }
      if (!Number.isFinite(quantite) || quantite <= 0) {
        return { ok: false, message: `Ligne ${i + 1} : la quantite doit etre superieure a 0.` };
      }
      const cle = `${type}-${articleId}`;
      const existante = regroupees.get(cle);
      if (existante) existante.quantiteDemandee += quantite;
      else regroupees.set(cle, { articleType: type, articleId, quantiteDemandee: quantite });
    }

    const transferOrderId = await createTransferOrder({
      depotSourceId: Number(params.depotSourceId),
      depotDestinationId: Number(params.depotDestinationId),
      dateJour: params.date,
      creePar: utilisateur,
      remarque: String(params.remarque || "").trim().slice(0, 300) || null,
      lignes: [...regroupees.values()],
    });

    let photoJointe = false;
    const image = String(params.imageBase64 || "");
    if (image && image.length <= TAILLE_MAX_PHOTO_BASE64) {
      photoJointe = await sauverPhotoTransferOrder(transferOrderId, Buffer.from(image, "base64"));
    }

    revalidatePath("/depots/transfer-order");
    return { ok: true, transferOrderId, photoJointe };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Creation impossible." };
  }
}
