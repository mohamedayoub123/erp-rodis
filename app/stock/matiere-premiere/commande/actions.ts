"use server";

import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import { canDeletePageUser, canWritePageUser, getCurrentStockUser } from "@/lib/stock-auth";
import { STATUT_DOSSIER_MP_OPTIONS } from "./constants";
import { DEVISE_OPTIONS } from "@/lib/devise-options";
import { convertirEnFcfa } from "@/lib/prix-devise";
import {
  COMPTE_ACHAT_MP,
  COMPTE_FOURNISSEURS,
  COMPTE_STOCK_MP,
  COMPTE_VARIATION_STOCK_MP,
  creerEcriture,
  resoudreOuCreerFournisseur,
  supprimerEcriturePourSource,
} from "@/lib/comptabilite";
import { recalculerEcrituresDependantes } from "@/lib/ecriture-recompute";

// Sources d'ecritures comptables generees par une Reception (voir plus bas,
// createReceptionMpAction) - reprises ici pour effacer les ecritures liees
// quand la reception qui les a creees est elle-meme supprimee.
const SOURCES_ECRITURE_RECEPTION_MP = ["mp_achat", "mp_stock_entree"];

function resolveDevise(value: string | null | undefined) {
  return (DEVISE_OPTIONS as readonly string[]).includes(value || "") ? (value as string) : "FCFA";
}

function parseOptionalText(formData: FormData, name: string) {
  const raw = String(formData.get(name) || "").trim();
  return raw || null;
}

async function fetchAllArticlesMp() {
  const rows: { id: number; nom_article: string }[] = [];
  let from = 0;
  const pageSize = 1000;

  while (true) {
    const { data, error } = await supabaseServer
      .from("articles_matiere_premiere")
      .select("id, nom_article")
      .range(from, from + pageSize - 1);

    if (error) break;

    const chunk = (data as { id: number; nom_article: string }[] | null) ?? [];
    rows.push(...chunk);

    if (chunk.length < pageSize) break;
    from += pageSize;
  }

  return rows;
}

// Meme cle de correspondance que bc/actions.ts (recalculee depuis
// nom_article, pas depuis la colonne article_normalise stockee dont le
// format a diverge selon l'origine des donnees) - utilisee ici pour
// re-resoudre a la volee les lignes de commande dont l'article_id est reste
// null (ancien bug de correspondance sur la creation de commande).
function normalizeArticle(value: string) {
  return value.replace(/\s+/g, "").trim().toUpperCase();
}

async function requireEditAccess() {
  const currentUser = await getCurrentStockUser();

  if (!(await canWritePageUser(currentUser, "commandeMp"))) {
    throw new Error("Cet utilisateur ne peut pas modifier les imports.");
  }

  return currentUser;
}

async function requireDeleteAccess() {
  const currentUser = await getCurrentStockUser();

  if (!(await canDeletePageUser(currentUser, "commandeMp"))) {
    throw new Error("Cet utilisateur ne peut pas supprimer les imports.");
  }

  return currentUser;
}

function revalidateCommandeMpPages() {
  revalidatePath("/stock/matiere-premiere/bc");
  revalidatePath("/stock/matiere-premiere/commande");
  revalidatePath("/stock/matiere-premiere/stock");
  revalidatePath("/stock/matiere-premiere/alerte");
  revalidatePath("/mouvements/matiere-premiere");
  revalidatePath("/dashboard");
}

// Corrige/remplit le prix d'un lot deja receptionne (page "Prix des lots
// MP") - les lots receptionnes avant l'ajout du prix, ou receptionnes sans,
// n'ont sinon aucune autre facon de le renseigner apres coup.
export async function updateLotPrixAction(formData: FormData) {
  await requireEditAccess();

  const lotId = Number(String(formData.get("lot_id") || "0"));
  if (!lotId) {
    throw new Error("Lot invalide.");
  }

  const prixUnitaireRaw = String(formData.get("prix_unitaire") || "").trim().replace(",", ".");
  const prixUnitaire = prixUnitaireRaw ? Number(prixUnitaireRaw) : null;
  const devise = resolveDevise(String(formData.get("devise") || ""));
  const tauxChangeRaw = String(formData.get("taux_change") || "").trim().replace(",", ".");
  const tauxChange = tauxChangeRaw ? Number(tauxChangeRaw) : null;

  if (prixUnitaireRaw && (prixUnitaire === null || Number.isNaN(prixUnitaire) || prixUnitaire < 0)) {
    throw new Error("Prix unitaire invalide.");
  }

  if (prixUnitaire !== null && devise !== "FCFA" && (tauxChange === null || Number.isNaN(tauxChange) || tauxChange <= 0)) {
    throw new Error("Taux de change invalide.");
  }

  const { error } = await supabaseServer
    .from("lots_stock_matiere_premiere")
    .update({
      prix_unitaire: prixUnitaire,
      devise,
      taux_change: devise !== "FCFA" ? tauxChange : null,
    })
    .eq("id", lotId);

  if (error) {
    throw new Error(error.message);
  }

  // Recalcule les 2 ecritures Achat/Stock MP de ce lot avec le prix
  // corrige - jamais laissees figees sur l'ancien prix. Efface d'abord
  // (que le nouveau prix soit connu ou non - un prix remis a vide/0 ne
  // doit plus laisser d'ecriture derriere lui, jamais un montant devine).
  // Try/catch qui n'interrompt jamais la correction de prix elle-meme.
  try {
    await supprimerEcriturePourSource("mp_achat", String(lotId));
    await supprimerEcriturePourSource("mp_stock_entree", String(lotId));

    const { data: lotData } = await supabaseServer
      .from("lots_stock_matiere_premiere")
      .select("article_id, qte_entree, fournisseur, date_reception, numero_lot")
      .eq("id", lotId)
      .maybeSingle();
    const lot = lotData as {
      article_id: number;
      qte_entree: number;
      fournisseur: string | null;
      date_reception: string | null;
      numero_lot: string;
    } | null;

    if (lot) {
      const currentUser = await getCurrentStockUser();

      if (prixUnitaire !== null && prixUnitaire > 0) {
        const prixUnitaireFcfa = convertirEnFcfa(prixUnitaire, devise, tauxChange);
        const montant = prixUnitaireFcfa !== null ? prixUnitaireFcfa * Number(lot.qte_entree) : null;

        if (montant !== null && montant > 0) {
          await resoudreOuCreerFournisseur(lot.fournisseur || "");
          const libelleFournisseur = lot.fournisseur || "Fournisseur non precise";
          const dateEcriture = lot.date_reception || new Date().toISOString().slice(0, 10);

          await creerEcriture({
            dateEcriture,
            pieceReference: lot.numero_lot,
            libelle: `Achat MP - ${lot.numero_lot} - ${libelleFournisseur}`,
            sourceType: "mp_achat",
            sourceId: String(lotId),
            createdBy: currentUser,
            lignes: [
              { compteCode: COMPTE_ACHAT_MP, debit: montant, credit: 0 },
              { compteCode: COMPTE_FOURNISSEURS, debit: 0, credit: montant },
            ],
          });

          await creerEcriture({
            dateEcriture,
            pieceReference: lot.numero_lot,
            libelle: `Entree stock MP - ${lot.numero_lot}`,
            sourceType: "mp_stock_entree",
            sourceId: String(lotId),
            createdBy: currentUser,
            lignes: [
              { compteCode: COMPTE_STOCK_MP, debit: montant, credit: 0 },
              { compteCode: COMPTE_VARIATION_STOCK_MP, debit: 0, credit: montant },
            ],
          });
        }
      }

      // Recalcule en cascade tout ce qui a deja ete chiffre en utilisant ce
      // lot (Fabrication, Entree production, Cout de vente) - sans ca, une
      // correction de prix ne se voyait que sur les 2 ecritures directes
      // ci-dessus, jamais sur ce qui avait deja consomme ce lot (demande
      // explicite de l'utilisateur).
      if (lot.numero_lot) {
        await recalculerEcrituresDependantes(lot.article_id, lot.numero_lot, currentUser);
      }
    }
  } catch (comptaError) {
    console.error("Ecriture comptable correction prix lot echouee:", comptaError);
  }

  revalidateCommandeMpPages();
}

// Enregistre une reception (numero de lot, dates, quantite) pour une ligne
// de commande, depuis le detail d'un dossier Import. Contrairement a
// "Creer import" (bc/actions.ts), la quantite receptionnee peut etre plus
// petite OU plus grande que la quantite commandee - des qu'on receptionne,
// la ligne passe au statut "Receptionne" (vert), quel que soit l'ecart. La
// quantite receptionnee entre aussi reellement dans le stock MP (meme table
// lots_stock_matiere_premiere que les entrees classiques), sinon le Stock MP
// et le Stock Alert MP ne bougeraient jamais suite a une reception.
export async function createReceptionMpAction(formData: FormData) {
  const currentUser = await requireEditAccess();

  const bcLigneId = Number(String(formData.get("bc_ligne_id") || "0"));
  const quantiteRaw = String(formData.get("quantite_importee") || "").trim().replace(",", ".");
  const quantiteImportee = quantiteRaw ? Number(quantiteRaw) : null;
  const numeroLot = parseOptionalText(formData, "numero_lot");
  const dateFabrication = parseOptionalText(formData, "date_fabrication");
  const dateExpiration = parseOptionalText(formData, "date_expiration");
  const dateReception = parseOptionalText(formData, "date_reception");
  const nDoss4dImport = parseOptionalText(formData, "n_doss_4d_import");
  const nDossErpImport = parseOptionalText(formData, "n_doss_erp_import");
  const prixUnitaireRaw = String(formData.get("prix_unitaire") || "").trim().replace(",", ".");
  const prixUnitaire = prixUnitaireRaw ? Number(prixUnitaireRaw) : null;
  const devise = resolveDevise(String(formData.get("devise") || ""));
  const tauxChangeRaw = String(formData.get("taux_change") || "").trim().replace(",", ".");
  const tauxChange = tauxChangeRaw ? Number(tauxChangeRaw) : null;

  if (!bcLigneId || quantiteImportee === null || Number.isNaN(quantiteImportee) || quantiteImportee <= 0) {
    throw new Error("Quantite receptionnee invalide.");
  }

  if (prixUnitaireRaw && (prixUnitaire === null || Number.isNaN(prixUnitaire) || prixUnitaire < 0)) {
    throw new Error("Prix unitaire invalide.");
  }

  if (prixUnitaire !== null && devise !== "FCFA" && (tauxChange === null || Number.isNaN(tauxChange) || tauxChange <= 0)) {
    throw new Error("Taux de change invalide.");
  }

  if (!numeroLot) {
    throw new Error("Le numero de lot est obligatoire pour receptionner.");
  }

  if (!dateFabrication) {
    throw new Error("La date de fabrication est obligatoire pour receptionner.");
  }

  if (!dateExpiration) {
    throw new Error("La date d'expiration est obligatoire pour receptionner.");
  }

  if (!dateReception) {
    throw new Error("La date de reception est obligatoire pour receptionner.");
  }

  const { data: ligneRow, error: ligneError } = await supabaseServer
    .from("bons_commande_matiere_premiere")
    .select("id, article_id, article_label")
    .eq("id", bcLigneId)
    .maybeSingle();

  if (ligneError || !ligneRow) {
    throw new Error("Ligne de commande introuvable.");
  }

  const ligne = ligneRow as { article_id: number | null; article_label: string | null };
  let articleId = ligne.article_id;

  // Certaines lignes de commande plus anciennes ont un article_id reste
  // null (bug de correspondance corrige depuis sur la creation de
  // commande) - on retente ici la resolution par nom avant d'abandonner,
  // pour ne pas bloquer la reception d'une commande deja existante.
  if (!articleId && ligne.article_label) {
    const target = normalizeArticle(ligne.article_label);
    const allArticles = await fetchAllArticlesMp();
    const found = allArticles.find(
      (article) => normalizeArticle(article.nom_article) === target
    );

    if (found) {
      articleId = found.id;
      await supabaseServer
        .from("bons_commande_matiere_premiere")
        .update({ article_id: articleId })
        .eq("id", bcLigneId);
    }
  }

  if (!articleId) {
    throw new Error(
      "Cet article n'est pas reconnu dans Articles Matiere Premiere - impossible de l'ajouter au stock. Verifie l'orthographe de l'article sur la commande."
    );
  }

  const { data: articleRow } = await supabaseServer
    .from("articles_matiere_premiere")
    .select("unite, depot_id")
    .eq("id", articleId)
    .maybeSingle();

  const unite = (articleRow as { unite: string | null; depot_id: number | null } | null)?.unite ?? null;
  // Sans depot, la reception est invisible dans les colonnes "Disponible
  // Depot" (Verifier Stock, TO/TI) et le filtre Depot de Stock MP - meme si
  // la quantite existe bien en base.
  const depotId = (articleRow as { unite: string | null; depot_id: number | null } | null)?.depot_id ?? null;

  const fournisseur = parseOptionalText(formData, "fournisseur");

  // Si une "declaration" d'import existe deja pour cette ligne (bouton
  // "Creer import" cote BC, createImportEvenementAction) et pas encore
  // receptionnee, la Reception la reutilise/reconcilie au lieu d'en creer
  // une nouvelle - sinon la declaration reste orpheline pour toujours
  // (jamais cloturee) et s'affiche a tort comme "encore en attente"
  // partout (Import MP, Commande MP, Statistique MP) alors que le lot est
  // deja bien entre en stock. Confirme sur un vrai cas (WHITE SECRET,
  // "1850 date prevue non saisie") et un nettoyage de 40 doublons
  // historiques (7 813 050 unites) le 2026-08-13.
  // La declaration peut etre receptionnee en plusieurs fois (livraison
  // partielle/fractionnee) - une simple egalite exacte de quantite ratait
  // ce cas (declaration de 460200 receptionnee en 339400 + 120800 : aucune
  // des 2 receptions ne correspond exactement, donc l'ancienne version
  // laissait la declaration orpheline). Confirme sur BC17 (6 articles,
  // 5 442 000 unites fantomes) le 2026-08-13.
  const { data: existingDeclaration } = await supabaseServer
    .from("bons_commande_mp_imports")
    .select("id, quantite_importee")
    .eq("bc_ligne_id", bcLigneId)
    .is("lot_stock_id", null)
    .order("id", { ascending: true })
    .limit(1)
    .maybeSingle();

  const declaration = existingDeclaration as { id: number; quantite_importee: number } | null;
  const declarationQuantite = declaration ? Number(declaration.quantite_importee) : null;

  let importId: number;
  if (declaration && declarationQuantite !== null && declarationQuantite > quantiteImportee) {
    // Reception partielle d'une declaration plus grande : on reduit la
    // declaration du montant recu maintenant (elle reste ouverte pour le
    // reste, encore a receptionner) et on cree une ligne separee pour la
    // portion recue.
    const { error: reduceError } = await supabaseServer
      .from("bons_commande_mp_imports")
      .update({ quantite_importee: declarationQuantite - quantiteImportee })
      .eq("id", declaration.id);

    if (reduceError) {
      throw new Error(reduceError.message);
    }

    const { data: importRow, error: insertImportError } = await supabaseServer
      .from("bons_commande_mp_imports")
      .insert([
        {
          bc_ligne_id: bcLigneId,
          quantite_importee: quantiteImportee,
          n_doss_4d_import: nDoss4dImport,
          n_doss_erp_import: nDossErpImport,
          numero_lot: numeroLot,
          date_fabrication: dateFabrication,
          date_expiration: dateExpiration,
          date_import: dateReception,
        },
      ])
      .select("id")
      .single();

    if (insertImportError) {
      throw new Error(insertImportError.message);
    }

    importId = (importRow as { id: number }).id;
  } else if (declaration) {
    // Reception qui couvre exactement, ou depasse, la declaration ouverte
    // (cas exact d'origine + cas d'une reception plus grande que ce qui
    // avait ete declare) : on cloture cette declaration en l'alignant sur
    // la quantite reellement recue au lieu d'en creer une autre.
    importId = declaration.id;
    const { error: updateImportError } = await supabaseServer
      .from("bons_commande_mp_imports")
      .update({
        quantite_importee: quantiteImportee,
        n_doss_4d_import: nDoss4dImport,
        n_doss_erp_import: nDossErpImport,
        numero_lot: numeroLot,
        date_fabrication: dateFabrication,
        date_expiration: dateExpiration,
        date_import: dateReception,
      })
      .eq("id", importId);

    if (updateImportError) {
      throw new Error(updateImportError.message);
    }
  } else {
    const { data: importRow, error: insertImportError } = await supabaseServer
      .from("bons_commande_mp_imports")
      .insert([
        {
          bc_ligne_id: bcLigneId,
          quantite_importee: quantiteImportee,
          n_doss_4d_import: nDoss4dImport,
          n_doss_erp_import: nDossErpImport,
          numero_lot: numeroLot,
          date_fabrication: dateFabrication,
          date_expiration: dateExpiration,
          date_import: dateReception,
        },
      ])
      .select("id")
      .single();

    if (insertImportError) {
      throw new Error(insertImportError.message);
    }

    importId = (importRow as { id: number }).id;
  }

  const { data: lotRow, error: insertLotError } = await supabaseServer
    .from("lots_stock_matiere_premiere")
    .insert([
      {
        article_id: articleId,
        date_jour: dateReception,
        date_reception: dateReception,
        numero_lot: numeroLot,
        code_normalise: numeroLot.toUpperCase(),
        date_fabrication: dateFabrication,
        date_expiration: dateExpiration,
        qte_entree: quantiteImportee,
        qte_sortie: 0,
        prix_unitaire: prixUnitaire,
        devise,
        taux_change: devise !== "FCFA" ? tauxChange : null,
        unite,
        depot_id: depotId,
        fournisseur,
        n_doss_erp: nDossErpImport,
        n_doss_4d: nDoss4dImport,
        utilisateur: currentUser,
        // Tag distinct de l'entree manuelle ("web:entree-mp") pour pouvoir
        // afficher la provenance (Manuel / Import) sur Mouvements MP - reste
        // compte comme une entree TE (voir ENTREE_SOURCES dans shared.ts).
        source_import: "web:reception-mp",
      },
    ])
    .select("id")
    .single();

  if (insertLotError) {
    throw new Error(insertLotError.message);
  }

  const lotId = (lotRow as { id: number }).id;

  const { error: groupError } = await supabaseServer
    .from("lots_stock_matiere_premiere")
    .update({ mouvement_groupe_id: lotId })
    .eq("id", lotId);

  if (groupError) {
    throw new Error(groupError.message);
  }

  // Relie l'evenement d'import a la ligne de stock qu'il a creee, pour
  // pouvoir retirer proprement le stock si cet import (ou tout le dossier,
  // ou la ligne de commande) est supprime plus tard.
  const { error: linkError } = await supabaseServer
    .from("bons_commande_mp_imports")
    .update({ lot_stock_id: lotId })
    .eq("id", importId);

  if (linkError) {
    throw new Error(linkError.message);
  }

  const { error: updateError } = await supabaseServer
    .from("bons_commande_matiere_premiere")
    .update({ statut: "Receptionne" })
    .eq("id", bcLigneId);

  if (updateError) {
    throw new Error(updateError.message);
  }

  // Une Reception fait toujours passer le dossier a "Receptionne Rodis"
  // automatiquement (statut final, verrouille ensuite - voir
  // updateDossierMpStatutAction) - ne touche jamais
  // date_prevue_reception pour ne pas la reecraser (meme bug que le
  // formulaire Statut, corrige le 2026-08-14).
  if (nDoss4dImport || nDossErpImport) {
    let dossierQuery = supabaseServer.from("dossiers_import_mp_statut").select("id");
    dossierQuery = nDoss4dImport
      ? dossierQuery.eq("n_doss_4d", nDoss4dImport)
      : dossierQuery.is("n_doss_4d", null);
    dossierQuery = nDossErpImport
      ? dossierQuery.eq("n_doss_erp", nDossErpImport)
      : dossierQuery.is("n_doss_erp", null);
    const { data: existingDossierStatut } = await dossierQuery.maybeSingle();

    const receptionneRodis = STATUT_DOSSIER_MP_OPTIONS[STATUT_DOSSIER_MP_OPTIONS.length - 1];
    if (existingDossierStatut) {
      await supabaseServer
        .from("dossiers_import_mp_statut")
        .update({ statut: receptionneRodis, updated_at: new Date().toISOString() })
        .eq("id", (existingDossierStatut as { id: number }).id);
    } else {
      await supabaseServer
        .from("dossiers_import_mp_statut")
        .insert([{ n_doss_4d: nDoss4dImport, n_doss_erp: nDossErpImport, statut: receptionneRodis }]);
    }
  }

  // Ecritures comptables automatiques (Achat/Fournisseur + Stock MP/Variation
  // de stock) - jamais generees si le prix n'est pas connu (jamais un
  // montant devine). Volontairement dans un try/catch qui n'interrompt pas
  // la reception : la comptabilite est secondaire par rapport au vrai
  // mouvement de stock, qui doit reussir meme si l'ecriture echoue.
  const prixUnitaireFcfa = convertirEnFcfa(prixUnitaire, devise, tauxChange);
  const montantFcfa = prixUnitaireFcfa !== null ? prixUnitaireFcfa * quantiteImportee : null;
  if (montantFcfa !== null && montantFcfa > 0) {
    try {
      await resoudreOuCreerFournisseur(fournisseur || "");
      const libelleFournisseur = fournisseur || "Fournisseur non precise";

      await creerEcriture({
        dateEcriture: dateReception,
        pieceReference: numeroLot,
        libelle: `Achat MP - ${numeroLot} - ${libelleFournisseur}`,
        sourceType: "mp_achat",
        sourceId: String(lotId),
        createdBy: currentUser,
        lignes: [
          { compteCode: COMPTE_ACHAT_MP, debit: montantFcfa, credit: 0 },
          { compteCode: COMPTE_FOURNISSEURS, debit: 0, credit: montantFcfa },
        ],
      });

      await creerEcriture({
        dateEcriture: dateReception,
        pieceReference: numeroLot,
        libelle: `Entree stock MP - ${numeroLot}`,
        sourceType: "mp_stock_entree",
        sourceId: String(lotId),
        createdBy: currentUser,
        lignes: [
          { compteCode: COMPTE_STOCK_MP, debit: montantFcfa, credit: 0 },
          { compteCode: COMPTE_VARIATION_STOCK_MP, debit: 0, credit: montantFcfa },
        ],
      });
    } catch (comptaError) {
      console.error("Ecriture comptable reception MP echouee:", comptaError);
    }
  }

  revalidateCommandeMpPages();
}

type ImportEvenementForCleanup = {
  id: number;
  bc_ligne_id: number;
  lot_stock_id: number | null;
};

// Supprime le stock credite par des evenements d'import (ceux issus d'une
// Reception) et remet leurs lignes de commande a "Stand" - a appeler AVANT
// de supprimer les evenements/lignes eux-memes, sinon le stock reste
// credite alors que la reception qui l'a cree n'existe plus.
async function releaseStockForImportEvenements(rows: ImportEvenementForCleanup[]) {
  const lotIds = rows.map((row) => row.lot_stock_id).filter((id): id is number => id !== null);
  const ligneIds = [...new Set(rows.filter((row) => row.lot_stock_id !== null).map((row) => row.bc_ligne_id))];

  if (lotIds.length > 0) {
    // Efface les ecritures comptables generees par la Reception (Achat/
    // Fournisseur + Stock MP/Variation de stock) AVANT de supprimer le lot,
    // sinon elles restent orphelines en comptabilite alors que le stock/
    // l'import qui les a creees n'existe plus. Comme a la creation, jamais
    // bloquant pour la vraie suppression de stock si ca echoue.
    try {
      const { error: ecritureError } = await supabaseServer
        .from("ecritures_comptables")
        .delete()
        .in("source_type", SOURCES_ECRITURE_RECEPTION_MP)
        .in("source_id", lotIds.map(String));
      if (ecritureError) throw new Error(ecritureError.message);
    } catch (comptaError) {
      console.error("Suppression ecriture comptable reception MP echouee:", comptaError);
    }

    const { error } = await supabaseServer.from("lots_stock_matiere_premiere").delete().in("id", lotIds);
    if (error) throw new Error(error.message);
  }

  if (ligneIds.length > 0) {
    const { error } = await supabaseServer
      .from("bons_commande_matiere_premiere")
      .update({ statut: "Stand" })
      .in("id", ligneIds)
      .eq("statut", "Receptionne");
    if (error) throw new Error(error.message);
  }
}

// Supprime un seul evenement d'import (une ligne de "Historique des
// imports") - si c'etait une Reception, retire aussi le stock credite et
// remet la ligne de commande a "Stand".
export async function deleteImportEvenementAction(formData: FormData) {
  await requireDeleteAccess();

  const importId = Number(String(formData.get("import_id") || "0"));

  if (!importId) {
    throw new Error("Import invalide.");
  }

  const { data: importRow, error: fetchError } = await supabaseServer
    .from("bons_commande_mp_imports")
    .select("id, bc_ligne_id, lot_stock_id")
    .eq("id", importId)
    .maybeSingle();

  if (fetchError || !importRow) {
    throw new Error("Import introuvable.");
  }

  await releaseStockForImportEvenements([importRow as ImportEvenementForCleanup]);

  const { error } = await supabaseServer.from("bons_commande_mp_imports").delete().eq("id", importId);

  if (error) {
    throw new Error(error.message);
  }

  revalidateCommandeMpPages();
}

// Supprime tout un dossier Import (tous les evenements qui partagent le
// meme doss. 4D/ERP), le stock credite par ses receptions, et son suivi de
// statut - pour effacer un dossier cree par erreur.
export async function deleteDossierImportsAction(formData: FormData) {
  await requireDeleteAccess();

  const nDoss4d = parseOptionalText(formData, "n_doss_4d");
  const nDossErp = parseOptionalText(formData, "n_doss_erp");

  let query = supabaseServer.from("bons_commande_mp_imports").select("id, bc_ligne_id, lot_stock_id");
  query = nDoss4d ? query.eq("n_doss_4d_import", nDoss4d) : query.is("n_doss_4d_import", null);
  query = nDossErp ? query.eq("n_doss_erp_import", nDossErp) : query.is("n_doss_erp_import", null);
  const { data: importRows, error: fetchError } = await query;

  if (fetchError) {
    throw new Error(fetchError.message);
  }

  const rows = (importRows ?? []) as ImportEvenementForCleanup[];
  await releaseStockForImportEvenements(rows);

  if (rows.length > 0) {
    const { error } = await supabaseServer
      .from("bons_commande_mp_imports")
      .delete()
      .in("id", rows.map((row) => row.id));

    if (error) {
      throw new Error(error.message);
    }
  }

  let statutQuery = supabaseServer.from("dossiers_import_mp_statut").delete();
  statutQuery = nDoss4d ? statutQuery.eq("n_doss_4d", nDoss4d) : statutQuery.is("n_doss_4d", null);
  statutQuery = nDossErp ? statutQuery.eq("n_doss_erp", nDossErp) : statutQuery.is("n_doss_erp", null);
  await statutQuery;

  revalidateCommandeMpPages();
}

// Retire une ligne de commande de CE dossier Import uniquement - supprime
// les evenements d'import qui la relient a ce doss. 4D/ERP (et le stock
// credite par une eventuelle reception parmi eux), mais PAS la ligne de
// commande elle-meme : sa quantite commandee reste intacte sur le BC, et
// "reste a importer" remonte tout seul puisqu'il se recalcule a partir des
// evenements restants. Supprimer completement la ligne (et sa quantite) se
// fait depuis le detail du BC (bc/actions.ts deleteCommandeBcLigneAction),
// pas depuis cette vue Import qui n'est qu'un regroupement par dossier.
export async function deleteBcLigneFromDossierAction(formData: FormData) {
  await requireDeleteAccess();

  const bcId = Number(String(formData.get("bc_id") || "0"));
  const nDoss4d = parseOptionalText(formData, "n_doss_4d");
  const nDossErp = parseOptionalText(formData, "n_doss_erp");

  if (!bcId) {
    throw new Error("Ligne invalide.");
  }

  let query = supabaseServer
    .from("bons_commande_mp_imports")
    .select("id, bc_ligne_id, lot_stock_id")
    .eq("bc_ligne_id", bcId);
  query = nDoss4d ? query.eq("n_doss_4d_import", nDoss4d) : query.is("n_doss_4d_import", null);
  query = nDossErp ? query.eq("n_doss_erp_import", nDossErp) : query.is("n_doss_erp_import", null);
  const { data: importRows } = await query;

  const rows = (importRows ?? []) as ImportEvenementForCleanup[];
  await releaseStockForImportEvenements(rows);

  if (rows.length > 0) {
    const { error } = await supabaseServer
      .from("bons_commande_mp_imports")
      .delete()
      .in("id", rows.map((row) => row.id));

    if (error) {
      throw new Error(error.message);
    }
  }

  revalidateCommandeMpPages();
}

// Statut de suivi manuel d'un dossier Import (Fabrication -> Import ->
// Receptionne au port -> Receptionne Rodis) + date prevue de reception
// (saisie manuelle). Un dossier n'a pas de table propre - identifie par la
// paire (n_doss_4d, n_doss_erp), comme partout ailleurs dans cette
// fonctionnalite.
export async function updateDossierMpStatutAction(formData: FormData) {
  await requireEditAccess();

  const nDoss4d = parseOptionalText(formData, "n_doss_4d");
  const nDossErp = parseOptionalText(formData, "n_doss_erp");
  const statut = String(formData.get("statut") || "").trim();
  const datePrevueReception = parseOptionalText(formData, "date_prevue_reception");

  if (!(STATUT_DOSSIER_MP_OPTIONS as readonly string[]).includes(statut)) {
    throw new Error("Statut invalide.");
  }

  let query = supabaseServer.from("dossiers_import_mp_statut").select("id, statut");
  query = nDoss4d ? query.eq("n_doss_4d", nDoss4d) : query.is("n_doss_4d", null);
  query = nDossErp ? query.eq("n_doss_erp", nDossErp) : query.is("n_doss_erp", null);
  const { data: existing } = await query.maybeSingle();

  if (existing) {
    // "Receptionne Rodis" est le statut final, mis automatiquement par la
    // Reception - plus modifiable a la main ensuite (sur demande
    // explicite), mais UNIQUEMENT le statut lui-meme : la date prevue
    // reste une info administrative modifiable a tout moment (un dossier
    // verrouille avant d'avoir eu sa date saisie doit pouvoir etre
    // corrige, pas rester bloque a "-" pour toujours).
    const receptionneRodis = STATUT_DOSSIER_MP_OPTIONS[STATUT_DOSSIER_MP_OPTIONS.length - 1];
    if ((existing as { statut: string }).statut === receptionneRodis && statut !== receptionneRodis) {
      throw new Error("Ce dossier est deja receptionne chez Rodis - le statut ne peut plus etre modifie.");
    }

    const { error } = await supabaseServer
      .from("dossiers_import_mp_statut")
      .update({ statut, date_prevue_reception: datePrevueReception, updated_at: new Date().toISOString() })
      .eq("id", (existing as { id: number }).id);

    if (error) throw new Error(error.message);
  } else {
    const { error } = await supabaseServer
      .from("dossiers_import_mp_statut")
      .insert([{ n_doss_4d: nDoss4d, n_doss_erp: nDossErp, statut, date_prevue_reception: datePrevueReception }]);

    if (error) throw new Error(error.message);
  }

  revalidateCommandeMpPages();
}
