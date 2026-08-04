-- Ajoute les causes d'arret pour le rapport Emballage, meme principe que
-- add_production_rapports_arrets.sql (Conditionnement) : un champ temps
-- (en minutes) par cause, remplissable independamment. Prefixees
-- "emballage_" pour ne pas entrer en collision avec les colonnes arret_*
-- deja utilisees par Conditionnement (les deux rapports partagent la meme
-- ligne production_rapports, une par programme_ligne_id).
alter table public.production_rapports
  add column if not exists emballage_arret_changement_bobine numeric,
  add column if not exists emballage_arret_technique numeric,
  add column if not exists emballage_arret_reglage numeric,
  add column if not exists emballage_arret_coupure numeric,
  add column if not exists emballage_arret_autre numeric;
