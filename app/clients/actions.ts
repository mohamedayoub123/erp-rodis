"use server";

import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import {
  canDeletePageUser,
  canWritePageUser,
  getCurrentStockUser,
} from "@/lib/stock-auth";

function normalizeClient(value: string) {
  return value.replace(/ /g, "").trim().toUpperCase();
}

async function requireClientsWriteAccess() {
  const currentUser = await getCurrentStockUser();

  if (!(await canWritePageUser(currentUser, "clients"))) {
    throw new Error("Cet utilisateur ne peut pas ajouter des clients.");
  }
}

async function requireClientsEditAccess() {
  const currentUser = await getCurrentStockUser();

  if (!(await canWritePageUser(currentUser, "clients"))) {
    throw new Error("Cet utilisateur ne peut pas modifier les clients.");
  }
}

async function requireClientsDeleteAccess() {
  const currentUser = await getCurrentStockUser();

  if (!(await canDeletePageUser(currentUser, "clients"))) {
    throw new Error("Cet utilisateur ne peut pas supprimer les clients.");
  }
}

export async function createClientAction(formData: FormData) {
  await requireClientsWriteAccess();

  const nomClient = String(formData.get("nom_client") || "").trim();
  const pays = String(formData.get("pays") || "").trim();
  const modeTransport = String(formData.get("mode_transport") || "").trim();

  if (!nomClient) {
    throw new Error("Le nom du client est obligatoire.");
  }

  const clientNormalise = normalizeClient(nomClient);

  const { data: existingClient } = await supabaseServer
    .from("clients")
    .select("id")
    .eq("client_normalise", clientNormalise)
    .maybeSingle();

  if (existingClient) {
    throw new Error(`Le client ${nomClient} existe deja.`);
  }

  const { error } = await supabaseServer.from("clients").insert([
    {
      nom_client: nomClient,
      client_normalise: clientNormalise,
      pays: pays || null,
      mode_transport: modeTransport || null,
    },
  ]);

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/clients");
  revalidatePath("/commandes");
  revalidatePath("/commandes/nouvelle");
}

export async function updateClientAction(formData: FormData) {
  await requireClientsEditAccess();

  const clientId = Number(String(formData.get("client_id") || "0"));
  const nomClient = String(formData.get("nom_client") || "").trim();
  const pays = String(formData.get("pays") || "").trim();
  const modeTransport = String(formData.get("mode_transport") || "").trim();

  if (!clientId || !nomClient) {
    throw new Error("Client invalide.");
  }

  const clientNormalise = normalizeClient(nomClient);

  const { data: duplicateClient } = await supabaseServer
    .from("clients")
    .select("id")
    .eq("client_normalise", clientNormalise)
    .neq("id", clientId)
    .maybeSingle();

  if (duplicateClient) {
    throw new Error(`Un autre client existe deja avec ce nom: ${nomClient}`);
  }

  const { error } = await supabaseServer
    .from("clients")
    .update({
      nom_client: nomClient,
      client_normalise: clientNormalise,
      pays: pays || null,
      mode_transport: modeTransport || null,
    })
    .eq("id", clientId);

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/clients");
  revalidatePath("/commandes");
  revalidatePath("/commandes/nouvelle");
}

export async function deleteClientAction(formData: FormData) {
  await requireClientsDeleteAccess();

  const clientId = Number(String(formData.get("client_id") || "0"));

  if (!clientId) {
    throw new Error("Client invalide.");
  }

  const { error } = await supabaseServer
    .from("clients")
    .delete()
    .eq("id", clientId);

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/clients");
  revalidatePath("/commandes");
  revalidatePath("/commandes/nouvelle");
}
