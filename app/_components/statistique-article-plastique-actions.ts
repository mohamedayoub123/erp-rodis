"use server";

import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import { canWritePageUser, getCurrentStockUser } from "@/lib/stock-auth";
import { fetchPlastiqueRows } from "@/app/_components/statistique-article-plastique";
import { lireTypeMachine } from "@/lib/type-machine-plastique";
import { fetchEquipementsPlastique } from "@/lib/equipements-plastique";

// Statistique Article Plastique (E3) n'existe plus que dans Production Plastique (la copie du Rapport MP a ete retiree) :
// le droit d'ecriture est celui de la page "Statistique Article Plastique (E3)" de Production Plastique.
async function requireStatistiqueArticlePlastiqueWriteAccess() {
  const currentUser = await getCurrentStockUser();

  if (!(await canWritePageUser(currentUser, "productionPlastiqueStatistique"))) {
    throw new Error("Cet utilisateur ne peut pas modifier cette page.");
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

  revalidatePath("/production-plastique/statistique");
}

function lireArticleId(formData: FormData): number {
  const articleId = Number(formData.get("article_id"));
  if (!Number.isInteger(articleId) || articleId <= 0) {
    throw new Error("Article invalide.");
  }
  return articleId;
}

// Nom de la machine sur laquelle l'article travaille, saisi a la main (vide = aucune machine).
export async function updateMachinePlastiqueAction(formData: FormData) {
  await requireStatistiqueArticlePlastiqueWriteAccess();

  const articleId = lireArticleId(formData);
  const machine = String(formData.get("machine") || "").trim().slice(0, 100) || null;

  // Une fois la liste des equipements plastique active, la machine doit en faire partie (ou etre celle que l'article a
  // deja : une machine saisie avant la liste reste valable tant qu'on ne la change pas)
  if (machine !== null) {
    const { pret, equipements } = await fetchEquipementsPlastique();
    if (pret && !equipements.some((equipement) => equipement.nom === machine)) {
      const { data: article } = await supabaseServer
        .from("articles_matiere_premiere")
        .select("machine_plastique")
        .eq("id", articleId)
        .maybeSingle();
      if ((article as { machine_plastique: string | null } | null)?.machine_plastique !== machine) {
        throw new Error("Equipement inconnu : choisis une machine de la liste (Production Plastique > Equipements).");
      }
    }
  }

  const { error } = await supabaseServer
    .from("articles_matiere_premiere")
    .update({ machine_plastique: machine })
    .eq("id", articleId);

  if (error) throw new Error(error.message);

  revalidatePath("/production-plastique/statistique");
}

// Type de machine (Injection, Soufflage ou PET), choisi dans la liste. Il est FIXE : on le choisit une seule fois, par article
// (demande explicite : le type decide de la feuille de l'export Excel, on ne doit plus pouvoir le changer). Un article qui a
// deja un type refuse tout changement, meme venant d'un formulaire envoye a la main ; la modification n'est ecrite que si le
// type est encore vide au moment de l'enregistrement (deux personnes en meme temps : la premiere gagne).
export async function updateTypeMachinePlastiqueAction(formData: FormData) {
  await requireStatistiqueArticlePlastiqueWriteAccess();

  const articleId = lireArticleId(formData);
  const typeMachine = lireTypeMachine(formData.get("type_machine"));

  const { data: actuel, error: erreurLecture } = await supabaseServer
    .from("articles_matiere_premiere")
    .select("type_machine_plastique")
    .eq("id", articleId)
    .maybeSingle();
  if (erreurLecture) throw new Error(erreurLecture.message);

  const courant = (actuel as { type_machine_plastique: string | null } | null)?.type_machine_plastique ?? null;
  if (courant !== null) {
    if (courant === typeMachine) return;
    throw new Error("Le type de machine de cet article est fixe : il ne peut plus etre change une fois choisi.");
  }
  if (typeMachine === null) return;

  const { data: modifies, error } = await supabaseServer
    .from("articles_matiere_premiere")
    .update({ type_machine_plastique: typeMachine })
    .eq("id", articleId)
    .is("type_machine_plastique", null)
    .select("id");
  if (error) throw new Error(error.message);
  if (!modifies || modifies.length === 0) {
    throw new Error("Le type de machine de cet article vient d'etre choisi : il est fixe et ne peut plus etre change.");
  }

  revalidatePath("/production-plastique/statistique");
}

// Nombre de cavites du moule, saisi a la main (vide = non renseigne) : entier entre 1 et 999
function lireNbCavites(formData: FormData): number | null {
  const texte = String(formData.get("nb_cavites") || "").trim();
  if (texte === "") return null;
  const nbCavites = Number(texte);
  if (!Number.isInteger(nbCavites) || nbCavites < 1 || nbCavites > 999) {
    throw new Error("Le nombre de cavites doit etre un nombre entier entre 1 et 999.");
  }
  return nbCavites;
}

// ---- Plusieurs machines par article, chacune avec ses cavites (table article_machines_plastique) ----
// Une machine se choisit dans la liste Production Plastique > Equipements, par son nom (sans tenir compte des majuscules ni des
// espaces : "m 16" = "M16"). La meme machine ajoutee deux fois ne cree pas de doublon : ses cavites sont mises a jour.
function cleNom(nom: string): string {
  return nom.replace(/\s+/g, "").toLowerCase();
}

function lireEquipementId(formData: FormData): number {
  const equipementId = Number(formData.get("equipement_id"));
  if (!Number.isInteger(equipementId) || equipementId <= 0) throw new Error("Machine invalide.");
  return equipementId;
}

function revalidatePagesPlastique() {
  revalidatePath("/production-plastique/statistique");
  revalidatePath("/production-plastique/equipements");
}

// Resultat de "Ajouter" : le message d'erreur est RENDU sous le formulaire. Une erreur levee (throw) dans une action serveur
// n'afficherait en production que la page generique "Une erreur s'est produite", sans dire pourquoi (machine absente de la
// liste, champ vide...).
export type EtatAjoutMachine = { erreur: string | null } | null;

async function ajouterMachinePlastique(formData: FormData) {
  await requireStatistiqueArticlePlastiqueWriteAccess();

  const articleId = lireArticleId(formData);
  const nomSaisi = String(formData.get("equipement") || "").trim();
  if (!nomSaisi) throw new Error("Tape ou choisis le nom d'une machine de la liste.");
  const nbCavites = lireNbCavites(formData);

  const { pret, equipements } = await fetchEquipementsPlastique();
  if (!pret) throw new Error("La liste des equipements n'est pas active : lance d'abord le SQL create_equipements_plastique.sql.");
  const equipement = equipements.find((candidat) => cleNom(candidat.nom) === cleNom(nomSaisi));
  if (!equipement) {
    throw new Error(
      `La machine "${nomSaisi}" n'est pas dans la liste. Choisis une machine proposee, ou ajoute-la d'abord dans Production Plastique > Equipements.`
    );
  }

  const { error } = await supabaseServer
    .from("article_machines_plastique")
    .upsert({ article_id: articleId, equipement_id: equipement.id, nb_cavites: nbCavites }, { onConflict: "article_id,equipement_id" });
  if (error) throw new Error(error.message);

  revalidatePagesPlastique();
}

export async function ajouterMachinePlastiqueAction(_etat: EtatAjoutMachine, formData: FormData): Promise<EtatAjoutMachine> {
  try {
    await ajouterMachinePlastique(formData);
    return { erreur: null };
  } catch (e) {
    return { erreur: e instanceof Error ? e.message : "Erreur pendant l'ajout de la machine." };
  }
}

export async function modifierCavitesMachinePlastiqueAction(formData: FormData) {
  await requireStatistiqueArticlePlastiqueWriteAccess();

  const articleId = lireArticleId(formData);
  const equipementId = lireEquipementId(formData);
  const nbCavites = lireNbCavites(formData);

  const { error } = await supabaseServer
    .from("article_machines_plastique")
    .update({ nb_cavites: nbCavites })
    .eq("article_id", articleId)
    .eq("equipement_id", equipementId);
  if (error) throw new Error(error.message);

  revalidatePagesPlastique();
}

export async function retirerMachinePlastiqueAction(formData: FormData) {
  await requireStatistiqueArticlePlastiqueWriteAccess();

  const articleId = lireArticleId(formData);
  const equipementId = lireEquipementId(formData);

  const { error } = await supabaseServer
    .from("article_machines_plastique")
    .delete()
    .eq("article_id", articleId)
    .eq("equipement_id", equipementId);
  if (error) throw new Error(error.message);

  revalidatePagesPlastique();
}

// Ancien fonctionnement (une seule machine et un seul nombre de cavites par article), garde tant que la table
// article_machines_plastique n'existe pas.
export async function updateNbCavitesAction(formData: FormData) {
  await requireStatistiqueArticlePlastiqueWriteAccess();

  const articleId = lireArticleId(formData);
  const nbCavites = lireNbCavites(formData);

  const { error } = await supabaseServer
    .from("articles_matiere_premiere")
    .update({ nb_cavites: nbCavites })
    .eq("id", articleId);

  if (error) throw new Error(error.message);

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
