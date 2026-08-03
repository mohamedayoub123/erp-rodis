-- Remplace la cause d'arret unique (menu deroulant) par un champ temps
-- (en minutes) pour CHAQUE cause possible, remplissable independamment.
alter table public.production_rapports
  drop column if exists arret_cause;

alter table public.production_rapports
  add column if not exists arret_depot numeric,
  add column if not exists arret_consommable_non_livre numeric,
  add column if not exists arret_manque_conditionnement numeric,
  add column if not exists arret_manque_vrac numeric,
  add column if not exists arret_technique numeric,
  add column if not exists arret_coupure_courant numeric,
  add column if not exists arret_raclage_vrac numeric,
  add column if not exists arret_changement_lot numeric,
  add column if not exists arret_flacons_nc numeric,
  add column if not exists arret_autre numeric;
