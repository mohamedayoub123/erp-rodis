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

// Regenere les codes de CETTE ligne (un seul article dans un CLAB) :
// repart du dernier code Lab connu de l'article (lab_code_auto ou
// lab_code_manu selon le type choisi a la creation), genere "nb_code"
// codes successifs, et remplace le code Lab de l'article par le DERNIER de
// la serie - meme regle "deja rempli -> reserve aux utilisateurs
// autorises" que le reste de Lab, puisque generer un nouveau code EST
// modifier un code deja ecrit. Utile si les codes n'ont pas ete generes a
// la creation (utilisateur sans ce droit a l'epoque) ou pour re-tirer la
// suite apres une correction.
export async function regenerateLabCodesAction(formData: FormData) {
  const generationId = Number(String(formData.get("generation_id") || "0"));
  let batchId: number | null = null;

  // Meme raison que saveFabricationRapportAction : Next.js remplace tout
  // throw non attrape par la page d'erreur generique - les validations
  // ci-dessous (pas de code de depart, format non reconnu, pas autorise a
  // ecraser) doivent remonter un vrai message sur la page du CLAB.
  try {
    const currentUser = await getCurrentStockUser();

    if (!(await canWritePageUser(currentUser, "qualiteLab"))) {
      throw new Error("Cet utilisateur ne peut pas regenerer de code Lab.");
    }

    if (!generationId) {
      throw new Error("Entree invalide.");
    }

    const { data: generationData, error: generationError } = await supabaseServer
      .from("qualite_lab_code_generations")
      .select("article_id, nb_code, type, batch_id")
      .eq("id", generationId)
      .maybeSingle();

    if (generationError) {
      throw new Error(generationError.message);
    }
    const generation = generationData as
      | { article_id: number; nb_code: number; type: "auto" | "manuel"; batch_id: number }
      | null;
    if (!generation) {
      throw new Error("Entree introuvable.");
    }
    batchId = generation.batch_id;

    const field = generation.type === "auto" ? "lab_code_auto" : "lab_code_manu";

    const { data: articleData, error: articleError } = await supabaseServer
      .from("articles")
      .select(field)
      .eq("id", generation.article_id)
      .maybeSingle();

    if (articleError) {
      throw new Error(articleError.message);
    }
    const currentCode = (articleData as Record<string, string | null> | null)?.[field] ?? null;

    if (!currentCode) {
      throw new Error(
        `Aucun code de depart - remplis d'abord le "${field === "lab_code_auto" ? "Code auto" : "Code manuel"}" de cet article dans Lab.`
      );
    }

    // Regenerer un code EST modifier un code deja rempli - meme droit que le
    // reste de Lab.
    if (!(await canQualiteLabOverwriteLotUser(currentUser))) {
      throw new Error("Cet utilisateur ne peut pas regenerer un code deja rempli.");
    }

    const codes = generateSequentialLabCodes(currentCode, generation.nb_code);
    if (!codes) {
      throw new Error(`Format de code non reconnu ("${currentCode}") - impossible de generer la suite.`);
    }

    const lastCode = codes[codes.length - 1];

    const { error: updateArticleError } = await supabaseServer
      .from("articles")
      .update({ [field]: lastCode })
      .eq("id", generation.article_id);
    if (updateArticleError) {
      throw new Error(updateArticleError.message);
    }

    const { error: updateGenerationError } = await supabaseServer
      .from("qualite_lab_code_generations")
      .update({ generated_codes: codes, updated_at: new Date().toISOString() })
      .eq("id", generationId);
    if (updateGenerationError) {
      throw new Error(updateGenerationError.message);
    }

    revalidatePath("/qualite/lab/generation");
    revalidatePath(`/qualite/lab/generation/${batchId}`);
    revalidatePath("/qualite/lab");
  } catch (error) {
    if (error && typeof error === "object" && "digest" in error && String(error.digest).startsWith("NEXT_REDIRECT")) {
      throw error;
    }
    const message = error instanceof Error ? error.message : "Erreur inconnue pendant la generation.";
    redirect(
      batchId
        ? `/qualite/lab/generation/${batchId}?erreur=${encodeURIComponent(message)}`
        : `/qualite/lab/generation?erreur=${encodeURIComponent(message)}`
    );
  }
}

export async function deleteLabCodeGenerationAction(formData: FormData) {
  const currentUser = await getCurrentStockUser();

  if (!(await canWritePageUser(currentUser, "qualiteLab"))) {
    throw new Error("Cet utilisateur ne peut pas supprimer d'entree Lab.");
  }

  const generationId = Number(String(formData.get("generation_id") || "0"));
  if (!generationId) {
    throw new Error("Entree invalide.");
  }

  const { data: generationData } = await supabaseServer
    .from("qualite_lab_code_generations")
    .select("batch_id")
    .eq("id", generationId)
    .maybeSingle();
  const batchId = (generationData as { batch_id: number } | null)?.batch_id ?? null;

  const { error } = await supabaseServer.from("qualite_lab_code_generations").delete().eq("id", generationId);
  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/qualite/lab/generation");
  if (batchId) revalidatePath(`/qualite/lab/generation/${batchId}`);

  // Reste sur la page du CLAB s'il reste d'autres lignes dedans, sinon
  // efface le CLAB devenu vide et retourne a la liste (sinon la page ferait
  // 404 sur un CLAB sans plus aucune ligne).
  if (batchId) {
    const { count } = await supabaseServer
      .from("qualite_lab_code_generations")
      .select("id", { count: "exact", head: true })
      .eq("batch_id", batchId);
    if (count && count > 0) {
      redirect(`/qualite/lab/generation/${batchId}`);
    }
    await supabaseServer.from("qualite_lab_code_batches").delete().eq("id", batchId);
  }
  redirect("/qualite/lab/generation");
}
