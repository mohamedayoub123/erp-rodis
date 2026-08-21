-- A coller dans Supabase Dashboard > SQL Editor > New query (2/2).
-- Meme correctif que add_conditionnement_fields_to_carton_entries.sql, pour
-- Emballage : ces champs deviennent PAR FOURNEE (une ligne
-- production_emballage_entries), au lieu d'etre ecrases a chaque saisie
-- supplementaire du meme (programme_ligne_id, code).
--
-- date_peremption reste sur production_rapports (propriete du lot/code).
--
-- Idempotent - colonnes nullable, aucune donnee existante modifiee.
alter table public.production_emballage_entries
  add column if not exists emballage_chef_zone text,
  add column if not exists emballage_machine text,
  add column if not exists emballage_operateur text,
  add column if not exists emballage_scotcheuse text,
  add column if not exists emballage_temps_demarrer text,
  add column if not exists emballage_temps_arret text,
  add column if not exists emballage_arret_changement_bobine numeric,
  add column if not exists emballage_arret_technique numeric,
  add column if not exists emballage_arret_reglage numeric,
  add column if not exists emballage_arret_coupure numeric,
  add column if not exists emballage_arret_autre numeric,
  add column if not exists nb_journaliers_emballage numeric,
  add column if not exists utilisateur_emballage text,
  add column if not exists date_saisie_emballage timestamptz;
