"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import { canQualiteLabOverwriteLotUser, canWritePageUser, getCurrentStockUser } from "@/lib/stock-auth";
import { generateSequentialLabCodes } from "@/lib/lab-code-increment";

// Une seule soumission peut creer plusieurs entrees d'un coup (demande
// explicite : "je peux ecrit plusieurs article dans le meme demande"), et
// TOUTES les lignes d'un meme Save doivent rester regroupees ensemble sous
// un seul "CLAB" (qualite_lab_code_batches) - demande explicite : "sa va
// registrer les different article ensemble sou nom CLAB1". Les codes sont
// generes tout de suite a la creation (pas besoin de cliquer "Regenerer"
// apres coup) en repartant du dernier code Lab connu de chaque article -
// meme regle "code deja rempli -> reserve aux utilisateurs autorises" que
// le reste de Lab, donc silencieusement ignore si l'utilisateur n'a pas ce
// droit (les codes resteront vides, regenerables plus tard par un
// utilisateur autorise).
export async function createLabCodeGenerationAction(formData: FormData) {
  const currentUser = await getCurrentStockUser();

  if (!(await canWritePageUser(currentUser, "qualiteLab"))) {
    throw new Error("Cet utilisateur ne peut pas creer d'entree Lab.");
  }
  const canOverwrite = await canQualiteLabOverwriteLotUser(currentUser);

  const lignesRaw = String(formData.get("lignes") || "").trim();
  if (!lignesRaw) {
    throw new Error("Aucune ligne a enregistrer.");
  }

  type RawLigne = { article_id: number | string; qt_vrac: number | string; nb_code: number | string; type: string };
  let lignes: RawLigne[];
  try {
    lignes = JSON.parse(lignesRaw) as RawLigne[];
  } catch {
    throw new Error("Contenu des lignes invalide.");
  }

  if (!Array.isArray(lignes) || lignes.length === 0) {
    throw new Error("Aucune ligne a enregistrer.");
  }

  const parsedLignes = lignes.map((ligne) => {
    const articleId = Number(ligne.article_id || 0);
    const qtVrac = Number(String(ligne.qt_vrac ?? "0").replace(",", "."));
    const nbCode = Number(ligne.nb_code || 0);
    const type = String(ligne.type || "").trim();

    if (!articleId) {
      throw new Error("Un article est invalide parmi les lignes.");
    }
    if (!nbCode || nbCode <= 0) {
      throw new Error("Un nombre de code est invalide parmi les lignes.");
    }
    if (type !== "auto" && type !== "manuel") {
      throw new Error("Un type est invalide parmi les lignes.");
    }

    return { articleId, qtVrac: qtVrac || null, nbCode, type: type as "auto" | "manuel" };
  });

  const { data: batchData, error: batchError } = await supabaseServer
    .from("qualite_lab_code_batches")
    .insert({ utilisateur: currentUser })
    .select("id")
    .single();
  if (batchError) {
    throw new Error(batchError.message);
  }
  const batchId = (batchData as { id: number }).id;

  // Suit le dernier code connu par (article, champ) PENDANT ce Save, pour
  // enchainer correctement si le meme article apparait 2 fois dans le meme
  // Save (2e ligne repart bien du code genere par la 1ere, pas de l'ancien
  // code encore en base).
  const knownCodeByKey = new Map<string, string | null>();
  const articleUpdates = new Map<string, string>();

  const rowsToInsert: {
    article_id: number;
    qt_vrac: number | null;
    nb_code: number;
    type: "auto" | "manuel";
    utilisateur: string | null;
    batch_id: number;
    generated_codes: string[] | null;
  }[] = [];

  for (const ligne of parsedLignes) {
    const field = ligne.type === "auto" ? "lab_code_auto" : "lab_code_manu";
    const key = `${ligne.articleId}:${field}`;

    let startCode = knownCodeByKey.get(key);
    if (startCode === undefined) {
      const { data: articleRow } = await supabaseServer
        .from("articles")
        .select(field)
        .eq("id", ligne.articleId)
        .maybeSingle();
      startCode = (articleRow as Record<string, string | null> | null)?.[field] ?? null;
    }

    let generatedCodes: string[] | null = null;
    if (canOverwrite && startCode) {
      const codes = generateSequentialLabCodes(startCode, ligne.nbCode);
      if (codes) {
        generatedCodes = codes;
        startCode = codes[codes.length - 1];
        articleUpdates.set(key, startCode);
      }
    }
    knownCodeByKey.set(key, startCode ?? null);

    rowsToInsert.push({
      article_id: ligne.articleId,
      qt_vrac: ligne.qtVrac,
      nb_code: ligne.nbCode,
      type: ligne.type,
      utilisateur: currentUser,
      batch_id: batchId,
      generated_codes: generatedCodes,
    });
  }

  const { error: insertError } = await supabaseServer.from("qualite_lab_code_generations").insert(rowsToInsert);
  if (insertError) {
    throw new Error(insertError.message);
  }

  for (const [key, lastCode] of articleUpdates.entries()) {
    const [articleIdStr, field] = key.split(":");
    const { error: updateArticleError } = await supabaseServer
      .from("articles")
      .update({ [field]: lastCode })
      .eq("id", Number(articleIdStr));
    if (updateArticleError) {
      throw new Error(updateArticleError.message);
    }
  }

  revalidatePath("/qualite/lab/generation");
  revalidatePath("/qualite/lab");
  redirect(`/qualite/lab/generation/${batchId}`);
}

// Supprime tout le CLAB (toutes ses lignes/articles) d'un coup depuis la
// liste, sans avoir a l'ouvrir d'abord.
export async function deleteLabCodeBatchAction(formData: FormData) {
  const currentUser = await getCurrentStockUser();

  if (!(await canWritePageUser(currentUser, "qualiteLab"))) {
    throw new Error("Cet utilisateur ne peut pas supprimer d'entree Lab.");
  }

  const batchId = Number(String(formData.get("batch_id") || "0"));
  if (!batchId) {
    throw new Error("CLAB invalide.");
  }

  const { error: deleteGenerationsError } = await supabaseServer
    .from("qualite_lab_code_generations")
    .delete()
    .eq("batch_id", batchId);
  if (deleteGenerationsError) {
    throw new Error(deleteGenerationsError.message);
  }

  const { error: deleteBatchError } = await supabaseServer
    .from("qualite_lab_code_batches")
    .delete()
    .eq("id", batchId);
  if (deleteBatchError) {
    throw new Error(deleteBatchError.message);
  }

  revalidatePath("/qualite/lab/generation");
  redirect("/qualite/lab/generation");
}
