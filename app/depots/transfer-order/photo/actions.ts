"use server";

import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import { fetchAllRowsParallel } from "@/lib/fetch-all-rows-parallel";
import { canWritePageUser, getCurrentStockUser } from "@/lib/stock-auth";
import { lireTransferOrderSurPhoto } from "@/lib/transfer-order-photo-lecture";
import {
  MAX_LIGNES_PHOTO,
  TAILLE_MAX_PHOTO_BASE64,
  preparerArticles,
  rapprocherArticle,
  rapprocherDepot,
  nettoyerPhotosTemporaires,
  rattacherPhotoTemporaire,
  sauverPhotoTemporaire,
  sauverPhotoTransferOrder,
  supprimerPhotoTemporaire,
  type ArticleRapprochable,
  type ArticleTypePhoto,
  type LecturePhotoTransferOrder,
} from "@/lib/transfer-order-photo";
import { createTransferOrder } from "../actions";

type Reponse<T> = ({ ok: true } & T) | { ok: false; message: string };

// Toutes les pages d'un coup (en parallele) : une lecture une page apres l'autre devenait tres
// longue des que la base ralentissait, et la lecture de la photo depassait alors le temps limite.
async function lireNomsArticles(table: "articles_matiere_premiere" | "articles"): Promise<ArticleRapprochable[]> {
  const lignes = await fetchAllRowsParallel<{ id: number; nom_article: string | null }>(
    () => supabaseServer.from(table).select("id", { count: "exact", head: true }),
    (from, to) =>
      supabaseServer.from(table).select("id, nom_article").order("id", { ascending: true }).range(from, to)
  );
  const resultat: ArticleRapprochable[] = [];
  for (const a of lignes) if (a.nom_article) resultat.push({ id: a.id, nom: a.nom_article });
  return resultat;
}

async function chargerDonneesRapprochement() {
  const [articlesMp, articlesPf, { data: depotsData, error: depotsError }] = await Promise.all([
    lireNomsArticles("articles_matiere_premiere"),
    lireNomsArticles("articles"),
    supabaseServer.from("depots").select("id, nom"),
  ]);
  if (depotsError) throw new Error(depotsError.message);
  return { articlesMp, articlesPf, depots: (depotsData ?? []) as { id: number; nom: string }[] };
}

function enOptions(articles: ArticleRapprochable[]) {
  return articles
    .map((a) => ({ id: a.id, label: a.nom }))
    .sort((a, b) => a.label.localeCompare(b.label, "fr", { sensitivity: "base" }));
}

// Lit la photo (IA) puis rapproche chaque nom d'article de ceux de l'ERP. Ne cree rien :
// l'utilisateur verifie la liste avant la creation. Retourne {ok, message} (jamais de throw :
// Next.js efface le message d'une Error jetee depuis une Server Action en production).
export async function lirePhotoTransferOrderAction(
  imageBase64: string,
  photoTempPrecedente?: string | null
): Promise<LecturePhotoTransferOrder> {
  try {
    const utilisateur = await getCurrentStockUser();
    if (!(await canWritePageUser(utilisateur, "depots"))) {
      return { ok: false, message: "Cet utilisateur ne peut pas creer de Transfer Order." };
    }

    const image = String(imageBase64 || "");
    if (!image) return { ok: false, message: "Choisis d'abord une photo." };
    if (image.length > TAILLE_MAX_PHOTO_BASE64) return { ok: false, message: "La photo est trop lourde." };

    // La lecture par l'IA et le chargement des articles se font EN MEME TEMPS : la duree totale
    // est celle du plus long des deux, pas leur somme. Le navigateur envoie toujours un JPEG
    // (photo reduite avant l'envoi).
    const extractionEnCours = lireTransferOrderSurPhoto(image, "image/jpeg");
    // La photo est aussi gardee cote serveur pendant la lecture (sans attendre) : a la creation du TO,
    // elle sera simplement rattachee, sans que le telephone doive la renvoyer. Une relecture
    // remplace la photo temporaire precedente.
    const photoTempEnCours = Promise.all([
      sauverPhotoTemporaire(Buffer.from(image, "base64")),
      supprimerPhotoTemporaire(photoTempPrecedente),
      nettoyerPhotosTemporaires(),
    ]).then(([chemin]) => chemin);
    const abandonner = () => void photoTempEnCours.then((chemin) => supprimerPhotoTemporaire(chemin));
    const donneesEnCours = chargerDonneesRapprochement().then(
      (donnees) => ({ ok: true as const, donnees }),
      (erreur: unknown) => ({ ok: false as const, erreur })
    );

    let extraction;
    try {
      extraction = await extractionEnCours;
    } catch (error) {
      abandonner();
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
      abandonner();
      return { ok: false, message: "Aucun article n'a ete lu sur cette photo. Reessaie avec une photo plus nette : telephone a plat, tout le tableau visible, bien eclaire." };
    }

    const chargement = await donneesEnCours;
    if (!chargement.ok) {
      abandonner();
      const detail = chargement.erreur instanceof Error ? chargement.erreur.message : "erreur inconnue";
      return { ok: false, message: `La liste des articles n'a pas pu etre lue (${detail}). Reessaie dans un instant.` };
    }
    const { articlesMp, articlesPf, depots } = chargement.donnees;
    // Chaque nom d'article n'est decoupe qu'une fois pour toutes les lignes lues
    const articlesMpPrepares = preparerArticles(articlesMp);
    const articlesPfPrepares = preparerArticles(articlesPf);

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
        ...rapprocherArticle(ligne.nom, articlesMpPrepares, articlesPfPrepares),
      })),
      articlesMp: enOptions(articlesMp),
      articlesPf: enOptions(articlesPf),
      photoTemp: await photoTempEnCours,
    };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Lecture impossible." };
  }
}

// nom : pour dire QUEL article manque de stock dans l'avertissement
type LigneACreer = { nom: string; articleType: ArticleTypePhoto; articleId: number; quantite: number };

// Cree le Transfer Order (en attente) puis garde la photo en piece jointe. Le TO reproduit un TO
// qui existe deja dans l'autre systeme : il est cree MEME si le stock du depot source est
// insuffisant ou a 0 (l'approbation repartit seulement ce qui est disponible). La fiche du TO
// montre le stock disponible de chaque ligne ; aucun calcul de stock ici pour que la creation soit rapide.
export async function creerTransferOrderDepuisPhotoAction(params: {
  date: string;
  depotSourceId: number;
  depotDestinationId: number;
  remarque: string;
  lignes: LigneACreer[];
  // Photo deja gardee pendant la lecture (cas normal) ; imageBase64 n'est envoyee que si elle manque
  // (photo tournee apres la lecture, par exemple)
  photoTemp: string | null;
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
    const regroupees = new Map<
      string,
      { articleType: ArticleTypePhoto; articleId: number; quantiteDemandee: number; nom: string }
    >();
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
      if (existante) {
        existante.quantiteDemandee += quantite;
      } else {
        regroupees.set(cle, {
          articleType: type,
          articleId,
          quantiteDemandee: quantite,
          nom: String(ligne.nom || "").trim() || `article #${articleId}`,
        });
      }
    }

    const depotSourceId = Number(params.depotSourceId);
    const lignesTo = [...regroupees.values()];

    const transferOrderId = await createTransferOrder({
      depotSourceId,
      depotDestinationId: Number(params.depotDestinationId),
      dateJour: params.date,
      creePar: utilisateur,
      remarque: String(params.remarque || "").trim().slice(0, 300) || null,
      lignes: lignesTo,
      sansControleStock: true,
    });

    let photoJointe = params.photoTemp ? await rattacherPhotoTemporaire(params.photoTemp, transferOrderId) : false;
    const image = String(params.imageBase64 || "");
    if (!photoJointe && image && image.length <= TAILLE_MAX_PHOTO_BASE64) {
      photoJointe = await sauverPhotoTransferOrder(transferOrderId, Buffer.from(image, "base64"));
    }

    revalidatePath("/depots/transfer-order");
    return { ok: true, transferOrderId, photoJointe };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Creation impossible." };
  }
}
