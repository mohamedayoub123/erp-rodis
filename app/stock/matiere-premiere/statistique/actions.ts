"use server";

import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import { canWritePageUser, getCurrentStockUser } from "@/lib/stock-auth";
import { GAMME_CONFIGS } from "./gamme-config";
import { editableFieldName } from "./field-name";

// Enregistre les colonnes "editable-*" de la config de la gamme (les seuls
// champs saisis a la main sur ce rapport) pour toutes les lignes soumises
// en une fois - donnees[...] garde tel quel le reste (stock/BC/4D/consos),
// qui n'est jamais modifie ici (recalcule en direct a chaque affichage de
// la page).
export async function saveRapportGammeStatistiqueAction(formData: FormData) {
  const currentUser = await getCurrentStockUser();

  if (!(await canWritePageUser(currentUser, "statistiqueMp"))) {
    throw new Error("Cet utilisateur ne peut pas modifier ce rapport.");
  }

  const gammeStatistique = String(formData.get("gamme_statistique") || "").trim();
  const config = GAMME_CONFIGS[gammeStatistique];
  if (!config) {
    throw new Error(`Gamme inconnue: ${gammeStatistique}`);
  }

  // "remarque_libre" est une colonne universelle ajoutee par le tableau
  // lui-meme (pas dans gamme-config.ts) - meme sur les gammes qui ont deja
  // leur propre colonne "remarque" issue de l'Excel source, c'est un champ
  // libre distinct, toujours present en derniere colonne.
  const editableColumns = [
    ...config.columns.filter((col) => col.kind === "editable-text" || col.kind === "editable-number"),
    { key: "remarque_libre", label: "Remarque", kind: "editable-text" as const },
  ];

  const rowIds = formData
    .getAll("row_id")
    .map((value) => Number(value))
    .filter((id) => Number.isFinite(id) && id > 0);

  const updates = rowIds.map((id) => {
    let donnees: Record<string, unknown> = {};
    try {
      donnees = JSON.parse(String(formData.get(`donnees_${id}`) || "{}"));
    } catch {
      donnees = {};
    }

    for (const col of editableColumns) {
      const raw = String(formData.get(editableFieldName(id, col.key)) || "").trim();
      if (col.kind === "editable-number") {
        const normalized = raw.replace(",", ".");
        if (!normalized) {
          donnees[col.key] = null;
        } else {
          const parsed = Number(normalized);
          // Une colonne "editable-number" recoit parfois une vraie note
          // texte a la place d'un chiffre (ex: "voir ayoub", "annule" -
          // usage reel trouve dans COLORANT PLASTIQUE, copie depuis le
          // fichier Excel source) - Number(...) donnerait NaN, qui
          // corrompait ensuite l'export Excel (cellule numerique avec un
          // NaN litteral, fichier rejete par Excel comme "reparable"; bug
          // reel confirme). Garde le texte tel quel plutot que d'ecraser
          // avec NaN/null.
          donnees[col.key] = Number.isFinite(parsed) ? parsed : raw;
        }
      } else {
        donnees[col.key] = raw || null;
      }
    }

    // ORDRE modifiable (voir rapport-table.tsx) - colonne dediee, pas dans
    // donnees. Ignore une valeur vide/invalide plutot que d'ecraser avec
    // 0 (le champ garde toujours une defaultValue numerique, ce cas ne
    // devrait survenir qu'en cas de saisie effacee par erreur).
    const rawOrdre = String(formData.get(`ordre_${id}`) || "").trim();
    const parsedOrdre = Number(rawOrdre);
    const ordre = Number.isFinite(parsedOrdre) && parsedOrdre > 0 ? Math.trunc(parsedOrdre) : null;

    // ordre_updated_at ne bouge QUE quand l'ORDRE soumis differe vraiment
    // de celui charge au debut (ordre_original_${id}) - toutes les lignes
    // renvoient un ordre_${id} a chaque sauvegarde (colonnes editables
    // incluses), le bouger a chaque fois casserait le tri par groupe (voir
    // buildRapportRowsWithLive dans page.tsx : NULL = jamais deplacee,
    // trie en premier dans son groupe ; une vraie date = deplacee, trie
    // apres les lignes jamais touchees de ce meme numero).
    const rawOriginalOrdre = String(formData.get(`ordre_original_${id}`) || "").trim();
    const originalOrdre = Number(rawOriginalOrdre);
    const ordreChanged = ordre !== null && Number.isFinite(originalOrdre) && ordre !== originalOrdre;

    return { id, donnees, ordre, ordreChanged };
  });

  const chunkSize = 20;
  for (let i = 0; i < updates.length; i += chunkSize) {
    const chunk = updates.slice(i, i + chunkSize);
    const results = await Promise.all(
      chunk.map((update) =>
        supabaseServer
          .from("rapport_gamme_statistique_mp")
          .update({
            donnees: update.donnees,
            ...(update.ordre !== null ? { ordre: update.ordre } : null),
            ...(update.ordreChanged ? { ordre_updated_at: new Date().toISOString() } : null),
          })
          .eq("id", update.id)
      )
    );
    const failed = results.find((result) => result.error);
    if (failed?.error) throw new Error(failed.error.message);
  }

  if (gammeStatistique) {
    revalidatePath(
      `/stock/matiere-premiere/statistique?gammeStatistique=${encodeURIComponent(gammeStatistique)}`
    );
  }
  revalidatePath("/stock/matiere-premiere/statistique");
}

// Ajoute une ligne au rapport pour un article MP existant - seule la
// designation est fixee ici (copiee telle quelle depuis articles_matiere_
// premiere pour garantir le rapprochement avec les donnees live, voir
// mapRapportRowsToLive dans page.tsx). Tout le reste (stock/BC/4D/consos)
// se calcule en direct des l'affichage, et les colonnes editables (avis,
// statistique 4D, remarque...) restent vides - demande explicite de
// l'utilisateur : "j'ajoute seulement l'article, le reste je le remplis
// moi-meme apres creation".
export async function addRapportGammeStatistiqueRowAction(formData: FormData) {
  const currentUser = await getCurrentStockUser();

  if (!(await canWritePageUser(currentUser, "statistiqueMp"))) {
    throw new Error("Cet utilisateur ne peut pas modifier ce rapport.");
  }

  const gammeStatistique = String(formData.get("gamme_statistique") || "").trim();
  const config = GAMME_CONFIGS[gammeStatistique];
  if (!config) {
    throw new Error(`Gamme inconnue: ${gammeStatistique}`);
  }

  const articleId = Number(formData.get("article_id"));
  if (!Number.isFinite(articleId) || articleId <= 0) {
    throw new Error("Choisis un article dans la liste avant d'ajouter.");
  }

  const { data: article, error: articleError } = await supabaseServer
    .from("articles_matiere_premiere")
    .select("nom_article")
    .eq("id", articleId)
    .maybeSingle();
  if (articleError || !article) {
    throw new Error("Article introuvable.");
  }

  const { data: existingRow } = await supabaseServer
    .from("rapport_gamme_statistique_mp")
    .select("id")
    .eq("gamme_statistique", gammeStatistique)
    .ilike("designation", article.nom_article)
    .maybeSingle();
  if (existingRow) {
    throw new Error(`"${article.nom_article}" est deja dans ce rapport.`);
  }

  const { data: maxOrdreRow } = await supabaseServer
    .from("rapport_gamme_statistique_mp")
    .select("ordre")
    .eq("gamme_statistique", gammeStatistique)
    .order("ordre", { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextOrdre = (maxOrdreRow?.ordre ?? 0) + 1;

  const { error: insertError } = await supabaseServer.from("rapport_gamme_statistique_mp").insert({
    gamme_statistique: gammeStatistique,
    designation: article.nom_article,
    categorie: null,
    ordre: nextOrdre,
    donnees: {},
  });
  if (insertError) throw new Error(insertError.message);

  if (gammeStatistique) {
    revalidatePath(
      `/stock/matiere-premiere/statistique?gammeStatistique=${encodeURIComponent(gammeStatistique)}`
    );
  }
  revalidatePath("/stock/matiere-premiere/statistique");
}
