"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import { canQualiteLabOverwriteLotUser, canWritePageUser, getCurrentStockUser } from "@/lib/stock-auth";
import { generateSequentialLabCodes } from "@/lib/lab-code-increment";

export async function createLabCodeGenerationAction(formData: FormData) {
  const currentUser = await getCurrentStockUser();

  if (!(await canWritePageUser(currentUser, "qualiteLab"))) {
    throw new Error("Cet utilisateur ne peut pas creer d'entree Lab.");
  }

  const articleId = Number(String(formData.get("article_id") || "0"));
  const qtVrac = Number(String(formData.get("qt_vrac") || "0").replace(",", "."));
  const nbCode = Number(String(formData.get("nb_code") || "0"));
  const type = String(formData.get("type") || "").trim();

  if (!articleId) {
    throw new Error("Article invalide.");
  }
  if (!nbCode || nbCode <= 0) {
    throw new Error("Nombre de code invalide.");
  }
  if (type !== "auto" && type !== "manuel") {
    throw new Error("Type invalide.");
  }

  const { error } = await supabaseServer.from("qualite_lab_code_generations").insert({
    article_id: articleId,
    qt_vrac: qtVrac || null,
    nb_code: nbCode,
    type,
    utilisateur: currentUser,
  });

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/qualite/lab/generation");
  redirect("/qualite/lab/generation");
}

// Regenere les codes de CETTE entree : repart du dernier code Lab connu de
// l'article (lab_code_auto ou lab_code_manu selon le type choisi a la
// creation), genere "nb_code" codes successifs, et remplace le code Lab de
// l'article par le DERNIER de la serie - meme regle "deja rempli -> reserve
// aux utilisateurs autorises" que le reste de Lab, puisque generer un
// nouveau code EST modifier un code deja ecrit.
export async function regenerateLabCodesAction(formData: FormData) {
  const generationId = Number(String(formData.get("generation_id") || "0"));

  // Meme raison que saveFabricationRapportAction : Next.js remplace tout
  // throw non attrape par la page d'erreur generique - les validations
  // ci-dessous (pas de code de depart, format non reconnu, pas autorise a
  // ecraser) doivent remonter un vrai message sur la page de l'entree.
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
      .select("article_id, nb_code, type")
      .eq("id", generationId)
      .maybeSingle();

    if (generationError) {
      throw new Error(generationError.message);
    }
    const generation = generationData as { article_id: number; nb_code: number; type: "auto" | "manuel" } | null;
    if (!generation) {
      throw new Error("Entree introuvable.");
    }

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
    revalidatePath(`/qualite/lab/generation/${generationId}`);
    revalidatePath("/qualite/lab");
  } catch (error) {
    if (error && typeof error === "object" && "digest" in error && String(error.digest).startsWith("NEXT_REDIRECT")) {
      throw error;
    }
    const message = error instanceof Error ? error.message : "Erreur inconnue pendant la generation.";
    redirect(`/qualite/lab/generation/${generationId}?erreur=${encodeURIComponent(message)}`);
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

  const { error } = await supabaseServer.from("qualite_lab_code_generations").delete().eq("id", generationId);
  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/qualite/lab/generation");
  redirect("/qualite/lab/generation");
}
