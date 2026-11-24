"use server";

import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import { canDeletePageUser, canWritePageUser, getCurrentStockUser } from "@/lib/stock-auth";
import { logAudit } from "@/lib/audit-log";
import {
  SQL_MACHINES_IDENTIQUES,
  calculerGroupes,
  machinesIdentiquesDisponible,
  membresDuGroupe,
  produitsAEcrire,
  type MachineGroupe,
  type ProduitMachine,
} from "@/lib/machines-identiques";

function toNumberOrNull(value: FormDataEntryValue | null) {
  const trimmed = String(value ?? "").trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

// Plusieurs types de produit possibles par machine (checkboxes, meme nom de
// champ "type_produit" repete) - tableau vide range en NULL, pas en [].
function toTypeProduitsArray(formData: FormData) {
  const values = formData.getAll("type_produit").map((v) => String(v).trim()).filter(Boolean);
  return values.length > 0 ? values : null;
}

// Une machine peut dependre de plusieurs machines Energie a la fois (meme
// convention que type_produit ci-dessus - checkboxes, meme nom de champ
// repete).
function toEnergieMachineIdsArray(formData: FormData) {
  const values = formData
    .getAll("energie_machine_ids")
    .map((v) => Number(String(v).trim()))
    .filter((v) => Number.isFinite(v) && v > 0);
  return values.length > 0 ? values : null;
}

export async function createMachineAction(formData: FormData) {
  const currentUser = await getCurrentStockUser();

  if (!(await canWritePageUser(currentUser, "machines"))) {
    throw new Error("Cet utilisateur ne peut pas ajouter de machine.");
  }

  const nom = String(formData.get("nom") || "").trim();
  if (!nom) {
    throw new Error("Le nom de la machine est obligatoire.");
  }

  const { error } = await supabaseServer.from("machines").insert({
    nom,
    zone: String(formData.get("zone") || "").trim() || null,
    type: String(formData.get("type") || "").trim() || null,
    type_produit: toTypeProduitsArray(formData),
    consommation_electrique_kw: toNumberOrNull(formData.get("consommation_electrique_kw")),
    consommation_gaz_litres_heure: toNumberOrNull(formData.get("consommation_gaz_litres_heure")),
    consommation_gasoil_litres_heure: toNumberOrNull(formData.get("consommation_gasoil_litres_heure")),
    energie_machine_ids: toEnergieMachineIdsArray(formData),
  });

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/production/machines");
}

export async function updateMachineAction(formData: FormData) {
  const currentUser = await getCurrentStockUser();

  if (!(await canWritePageUser(currentUser, "machines"))) {
    throw new Error("Cet utilisateur ne peut pas modifier de machine.");
  }

  const id = Number(String(formData.get("id") || "0"));
  const nom = String(formData.get("nom") || "").trim();

  if (!id || !nom) {
    throw new Error("Machine invalide.");
  }

  const { error } = await supabaseServer
    .from("machines")
    .update({
      nom,
      zone: String(formData.get("zone") || "").trim() || null,
      type: String(formData.get("type") || "").trim() || null,
      type_produit: toTypeProduitsArray(formData),
      consommation_electrique_kw: toNumberOrNull(formData.get("consommation_electrique_kw")),
      consommation_gaz_litres_heure: toNumberOrNull(formData.get("consommation_gaz_litres_heure")),
      consommation_gasoil_litres_heure: toNumberOrNull(formData.get("consommation_gasoil_litres_heure")),
      energie_machine_ids: toEnergieMachineIdsArray(formData),
    })
    .eq("id", id);

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/production/machines");
}

export async function deleteMachineAction(formData: FormData) {
  const currentUser = await getCurrentStockUser();

  if (!(await canDeletePageUser(currentUser, "machines"))) {
    throw new Error("Cet utilisateur ne peut pas supprimer de machine.");
  }

  const id = Number(String(formData.get("id") || "0"));
  if (!id) {
    throw new Error("Machine introuvable.");
  }

  const { error } = await supabaseServer.from("machines").delete().eq("id", id);

  if (error) {
    // Code Postgres 23503 = violation de cle etrangere - une machine deja
    // citee dans un programme (machine_fabrication_id/conditionnement_id/
    // emballage_id, voir create_programmes.sql) ne peut pas etre supprimee
    // sans casser cet historique. Message clair au lieu de laisser
    // l'erreur brute Postgres remonter jusqu'a l'ecran d'erreur generique.
    if (error.code === "23503") {
      throw new Error(
        "Cette machine est deja utilisee dans un ou plusieurs programmes de production - impossible de la supprimer."
      );
    }
    throw new Error(error.message);
  }

  revalidatePath("/production/machines");
}

export async function addMachineProduitAction(formData: FormData) {
  const currentUser = await getCurrentStockUser();

  if (!(await canWritePageUser(currentUser, "machines"))) {
    throw new Error("Cet utilisateur ne peut pas ajouter de produit.");
  }

  const machineId = Number(String(formData.get("machine_id") || "0"));
  const articleId = Number(String(formData.get("article_id") || "0"));

  if (!machineId || !articleId) {
    throw new Error("Choisis un produit avant d'ajouter.");
  }

  const valeurs = {
    temps_minutes: toNumberOrNull(formData.get("temps_minutes")),
    capacite: toNumberOrNull(formData.get("capacite")),
    capacite_min: toNumberOrNull(formData.get("capacite_min")),
    capacite_max: toNumberOrNull(formData.get("capacite_max")),
  };

  // Le produit (avec ses valeurs) est ecrit en meme temps sur toutes les machines identiques de celle-ci
  const identiques = await idsMachinesIdentiques(machineId);
  const machineIds = [machineId, ...identiques];

  const { error } = await supabaseServer.from("machine_produits").upsert(
    machineIds.map((id) => ({ machine_id: id, article_id: articleId, ...valeurs })),
    { onConflict: "machine_id,article_id" }
  );

  if (error) {
    throw new Error(error.message);
  }

  for (const id of machineIds) revalidatePath(`/production/machines/${id}`);
}

export async function deleteMachineProduitAction(formData: FormData) {
  const currentUser = await getCurrentStockUser();

  if (!(await canDeletePageUser(currentUser, "machines"))) {
    throw new Error("Cet utilisateur ne peut pas supprimer de produit.");
  }

  const id = Number(String(formData.get("id") || "0"));
  const machineId = Number(String(formData.get("machine_id") || "0"));

  if (!id) {
    throw new Error("Produit introuvable.");
  }

  // Retirer un produit d'une machine le retire aussi de ses machines identiques (sinon elles ne seraient
  // plus identiques). On relit la ligne en base : machine et produit viennent d'elle, pas du formulaire.
  const { data: ligneData } = await supabaseServer
    .from("machine_produits")
    .select("machine_id, article_id")
    .eq("id", id)
    .maybeSingle();
  const ligne = ligneData as { machine_id: number; article_id: number } | null;
  const identiques = ligne ? await idsMachinesIdentiques(ligne.machine_id) : [];

  const { error } =
    ligne && identiques.length > 0
      ? await supabaseServer
          .from("machine_produits")
          .delete()
          .eq("article_id", ligne.article_id)
          .in("machine_id", [ligne.machine_id, ...identiques])
      : await supabaseServer.from("machine_produits").delete().eq("id", id);

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath(`/production/machines/${machineId}`);
  for (const autre of identiques) revalidatePath(`/production/machines/${autre}`);
}

// Machines identiques a une machine (sans elle) : vide tant que le SQL n'est pas execute ou si la
// machine n'a pas de groupe.
async function idsMachinesIdentiques(machineId: number): Promise<number[]> {
  if (!(await machinesIdentiquesDisponible())) return [];
  const { data: machineData } = await supabaseServer
    .from("machines")
    .select("id, type, groupe_identique_id")
    .eq("id", machineId)
    .maybeSingle();
  const machine = machineData as MachineGroupe | null;
  if (!machine || machine.groupe_identique_id === null) return [];

  const { data } = await supabaseServer
    .from("machines")
    .select("id, type, groupe_identique_id")
    .eq("groupe_identique_id", machine.groupe_identique_id);
  return membresDuGroupe((data ?? []) as MachineGroupe[], machineId);
}

// Section "Machines identiques" de la page d'une machine : on coche les machines identiques (du meme
// type). Elles rejoignent le groupe de la machine (identique a une identique = identique), puis les
// produits de tout le groupe sont mis en commun : chaque machine recoit ceux qui lui manquent, et si
// cette machine-ci a deja le produit, ses valeurs gagnent sur les autres. Decocher une machine la sort
// du groupe sans rien lui retirer. Ensuite ajouter / retirer un produit se fait sur tout le groupe.
export async function updateMachinesIdentiquesAction(formData: FormData) {
  const currentUser = await getCurrentStockUser();

  if (!(await canWritePageUser(currentUser, "machines"))) {
    throw new Error("Cet utilisateur ne peut pas modifier les machines identiques.");
  }
  if (!(await machinesIdentiquesDisponible())) {
    throw new Error(`Les machines identiques ne sont pas encore activees : lance d'abord ${SQL_MACHINES_IDENTIQUES} dans Supabase.`);
  }

  const machineId = Number(String(formData.get("machine_id") || "0"));
  if (!machineId) {
    throw new Error("Machine invalide.");
  }
  const choisis = formData
    .getAll("identique_id")
    .map((v) => Number(String(v).trim()))
    .filter((v) => Number.isFinite(v) && v > 0);

  const { data: machinesData, error: lectureError } = await supabaseServer
    .from("machines")
    .select("id, nom, type, groupe_identique_id");
  if (lectureError) {
    throw new Error(lectureError.message);
  }
  const machines = (machinesData ?? []) as (MachineGroupe & { nom: string })[];
  if (!machines.some((m) => m.id === machineId)) {
    throw new Error("Machine introuvable.");
  }

  const { changements, groupe, retires } = calculerGroupes(machines, machineId, choisis);

  // Un seul update par numero de groupe (pas une requete par machine)
  const parGroupe = new Map<number | null, number[]>();
  for (const changement of changements) {
    parGroupe.set(changement.groupe, [...(parGroupe.get(changement.groupe) ?? []), changement.id]);
  }
  for (const [numero, ids] of parGroupe) {
    const { error } = await supabaseServer.from("machines").update({ groupe_identique_id: numero }).in("id", ids);
    if (error) {
      throw new Error(error.message);
    }
  }

  // Mise en commun des produits du groupe (machine courante = source qui gagne en cas de valeurs differentes)
  let produitsCopies = 0;
  if (groupe.length >= 2) {
    const { data: produitsData, error: produitsError } = await supabaseServer
      .from("machine_produits")
      .select("machine_id, article_id, temps_minutes, capacite, capacite_min, capacite_max")
      .in("machine_id", groupe);
    if (produitsError) {
      throw new Error(produitsError.message);
    }
    const aEcrire = produitsAEcrire((produitsData ?? []) as ProduitMachine[], groupe, machineId);
    if (aEcrire.length > 0) {
      const { error } = await supabaseServer.from("machine_produits").upsert(aEcrire, { onConflict: "machine_id,article_id" });
      if (error) {
        throw new Error(error.message);
      }
    }
    produitsCopies = aEcrire.length;
  }

  if (changements.length > 0 || produitsCopies > 0) {
    const nom = (id: number) => machines.find((m) => m.id === id)?.nom ?? `#${id}`;
    const autres = groupe.filter((id) => id !== machineId).map(nom);
    await logAudit({
      utilisateur: currentUser,
      module: "Machines",
      action: "modification",
      cible: nom(machineId),
      resume:
        `Machines identiques de ${nom(machineId)} : ${autres.length > 0 ? autres.join(", ") : "aucune"}` +
        (retires.length > 0 ? ` (retirees : ${retires.map(nom).join(", ")})` : "") +
        (produitsCopies > 0 ? ` - ${produitsCopies} produit(s) mis en commun` : ""),
      avant: { groupes: changements.map((c) => ({ id: c.id, groupe_avant: machines.find((m) => m.id === c.id)?.groupe_identique_id ?? null })) },
      apres: { groupes: changements },
    });
  }

  revalidatePath("/production/machines");
  for (const id of new Set([machineId, ...groupe, ...retires])) revalidatePath(`/production/machines/${id}`);
}
