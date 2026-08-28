"use server";

import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import { canWritePageUser, getCurrentStockUser } from "@/lib/stock-auth";
import { fetchPlastiqueRows } from "@/app/_components/statistique-article-plastique";

// Utilisee depuis Rapport MP (stockPlastiqueMp) ET Production Plastique
// (productionPlastique) - le composant est partage entre les 2, le droit
// d'ecriture accorde depuis L'UN OU L'AUTRE module suffit.
async function requireStatistiqueArticlePlastiqueWriteAccess() {
  const currentUser = await getCurrentStockUser();
  const canFromRapportMp = await canWritePageUser(currentUser, "stockPlastiqueMp");
  const canFromProduction = await canWritePageUser(currentUser, "productionPlastique");

  if (!canFromRapportMp && !canFromProduction) {
    throw new Error("Cet utilisateur ne peut pas modifier l'avis de fabrication.");
  }

  return currentUser;
}

export async function updateAvisFabricationAction(formData: FormData) {
  await requireStatistiqueArticlePlastiqueWriteAccess();

  const articleId = Number(formData.get("article_id"));
  if (!Number.isFinite(articleId) || articleId <= 0) {
    throw new Error("Article invalide.");
  }

  const avis = String(formData.get("avis_fabrication") || "").trim() || null;

  const { error } = await supabaseServer
    .from("articles_matiere_premiere")
    .update({ avis_fabrication: avis })
    .eq("id", articleId);

  if (error) throw new Error(error.message);

  revalidatePath("/stock/matiere-premiere/rapport/plastique");
  revalidatePath("/production-plastique/statistique");
}

// "Save" (Statistique Article Plastique) - photo figee des articles qui
// ont un avis de fabrication rempli a cet instant precis (article, avis,
// stock actuel du moment), sous un code "C<annee>.<n>" (n = position dans
// l'annee en cours, redemarre a 1 chaque nouvelle annee) - demande
// explicite : une NOUVELLE commande a chaque clic, jamais une mise a jour
// d'une commande existante.
export async function saveCommandeArticlePlastiqueAction(): Promise<
  { ok: true; href: string } | { ok: false; message: string }
> {
  try {
    const currentUser = await requireStatistiqueArticlePlastiqueWriteAccess();

    const { rows, error } = await fetchPlastiqueRows();
    if (error) return { ok: false, message: error };

    const lignesAvisRemplis = rows.filter((row) => (row.avis_fabrication || "").trim());
    if (lignesAvisRemplis.length === 0) {
      return { ok: false, message: "Aucun article n'a d'avis de fabrication rempli - rien a enregistrer." };
    }

    const currentYear = new Date().getFullYear();
    const { count } = await supabaseServer
      .from("commandes_article_plastique")
      .select("id", { count: "exact", head: true })
      .like("code", `C${currentYear}.%`);
    const code = `C${currentYear}.${(count ?? 0) + 1}`;

    const { data: commande, error: insertHeaderError } = await supabaseServer
      .from("commandes_article_plastique")
      .insert({ code, created_by: currentUser })
      .select("id, code")
      .single();
    if (insertHeaderError || !commande) {
      return { ok: false, message: insertHeaderError?.message || "Erreur lors de la creation de la commande." };
    }

    const lignes = lignesAvisRemplis.map((row) => ({
      commande_id: commande.id,
      article_id: row.article_id,
      nom_article: row.nom_article,
      categorie: row.categorie,
      gamme: row.gamme,
      qt_avis: row.avis_fabrication,
      stock_actuel: row.stock_actuel,
    }));

    const { error: insertLignesError } = await supabaseServer
      .from("commandes_article_plastique_lignes")
      .insert(lignes);
    if (insertLignesError) {
      // Retire l'entete orpheline plutot que de laisser une commande vide.
      await supabaseServer.from("commandes_article_plastique").delete().eq("id", commande.id);
      return { ok: false, message: insertLignesError.message };
    }

    revalidatePath("/production-plastique/commandes");

    return { ok: true, href: `/production-plastique/commandes/${commande.code}` };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "Erreur pendant l'enregistrement." };
  }
}
