-- A coller dans Supabase Dashboard > SQL Editor > New query (1/2).
-- Corrige un bug reel de perte de donnees : ces champs vivaient sur
-- production_rapports (une seule ligne par (programme_ligne_id, code)),
-- alors que Conditionnement peut etre saisi PLUSIEURS fois pour le meme
-- code (plusieurs "fournees" reelles, deja additives sur
-- production_carton_entries.quantite) - chaque nouvelle saisie ecrasait
-- silencieusement les infos (chef/ravitailleur/dechets/arrets) de la
-- fournee precedente. Ces colonnes deviennent desormais PAR FOURNEE
-- (une ligne production_carton_entries = une fournee complete).
--
-- date_fabrication_conditionnement et date_peremption restent sur
-- production_rapports (proprietes du lot/code, pas de la fournee).
--
-- Idempotent - colonnes nullable, aucune donnee existante modifiee.
alter table public.production_carton_entries
  add column if not exists chef_zone text,
  add column if not exists chef_ligne text,
  add column if not exists ravitailleur text,
  add column if not exists tireur text,
  add column if not exists qt_fabriquer numeric,
  add column if not exists cadence numeric,
  add column if not exists poids_reel numeric,
  add column if not exists dechet_sleeve numeric,
  add column if not exists dechet_capsule numeric,
  add column if not exists dechet_pompe numeric,
  add column if not exists dechet_flacon numeric,
  add column if not exists dechet_pot numeric,
  add column if not exists dechet_etiquette numeric,
  add column if not exists dechet_etui numeric,
  add column if not exists temps_demarage_lot time,
  add column if not exists temps_arret_batch time,
  add column if not exists arret_depot numeric,
  add column if not exists arret_consommable_non_livre numeric,
  add column if not exists arret_manque_conditionnement numeric,
  add column if not exists arret_manque_vrac numeric,
  add column if not exists arret_technique numeric,
  add column if not exists arret_coupure_courant numeric,
  add column if not exists arret_raclage_vrac numeric,
  add column if not exists arret_changement_lot numeric,
  add column if not exists arret_flacons_nc numeric,
  add column if not exists arret_autre numeric,
  add column if not exists nb_journaliers_conditionnement numeric,
  add column if not exists utilisateur_conditionnement text,
  add column if not exists date_saisie_conditionnement timestamptz;
