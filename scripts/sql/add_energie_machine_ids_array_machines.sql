-- A coller dans Supabase Dashboard > SQL Editor > New query.
-- Une machine normale peut dependre de PLUSIEURS machines Energie a la fois
-- (pas juste une) - remplace la colonne energie_machine_id (simple FK,
-- ajoutee par add_energie_machine_id_machines.sql) par un tableau
-- energie_machine_ids, meme convention que type_produit (deja un tableau
-- sur cette table).
--
-- Idempotent (peut etre relance sans risque) - colonne nullable, aucune
-- donnee existante modifiee. L'ancienne colonne energie_machine_id reste en
-- base (plus utilisee par le code) mais n'est pas supprimee, pour rester
-- non destructif.
alter table public.machines
  add column if not exists energie_machine_ids bigint[];
