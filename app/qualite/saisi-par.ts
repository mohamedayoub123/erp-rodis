import { cache } from "react";
import { supabaseServer } from "@/lib/supabase-server";

// Colonne "Saisi par" des NC et des TAF : l'utilisateur qui a cree la ligne (rempli par le serveur a la creation, jamais
// tape a la main). La colonne est creee par scripts/sql/add_saisi_par_nc_taf.sql ; tant que ce SQL n'est pas execute,
// rien n'est ecrit (les enregistrements marchent comme avant) et la colonne reste vide.
export const saisiParDisponible = cache(async (): Promise<boolean> => {
  const tables = ["qualite_nc_confidentiel", "qualite_taf_confidentiel"];
  const resultats = await Promise.all(tables.map((table) => supabaseServer.from(table).select("saisi_par").limit(1)));
  return resultats.every((resultat) => !resultat.error);
});
