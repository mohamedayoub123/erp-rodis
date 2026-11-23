import { cache } from "react";
import { supabaseServer } from "@/lib/supabase-server";

// Ligne "Remarque" du Tableau de commande (une remarque libre par commande, avant la ligne "Date commande"). La colonne est creee par
// scripts/sql/add_commandes_remarque_tableau.sql : tant que ce SQL n'est pas execute, elle n'est ni lue, ni ecrite, ni affichee - le
// Tableau de commande marche comme avant (une colonne absente ferait echouer toute la lecture des commandes).
export const SQL_REMARQUE_TABLEAU = "scripts/sql/add_commandes_remarque_tableau.sql";

export const remarqueTableauDisponible = cache(async (): Promise<boolean> => {
  const { error } = await supabaseServer.from("commandes").select("remarque_tableau_commande").limit(1);
  return !error;
});
