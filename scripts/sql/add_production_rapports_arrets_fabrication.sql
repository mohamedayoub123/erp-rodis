-- Ajoute les causes d'arret specifiques a la Fabrication (aucune n'existait
-- avant - seul Conditionnement et Emballage avaient des causes d'arret) -
-- meme principe que les colonnes emballage_arret_* : minutes d'arret par
-- cause, saisies sur le rapport Fabrication.
alter table public.production_rapports
  add column if not exists fabrication_arret_absence_air numeric,
  add column if not exists fabrication_arret_absence_vapeur numeric,
  add column if not exists fabrication_arret_attente_aspiration_aqueuse numeric,
  add column if not exists fabrication_arret_attente_cuves_mobiles numeric,
  add column if not exists fabrication_arret_attente_eau_osmosee numeric,
  add column if not exists fabrication_arret_coupure_electrique numeric,
  add column if not exists fabrication_arret_maintenance_plateforme numeric,
  add column if not exists fabrication_arret_manque_cuves_mobiles numeric,
  add column if not exists fabrication_arret_probleme_pompe numeric,
  add column if not exists fabrication_arret_probleme_ph numeric,
  add column if not exists fabrication_arret_probleme_technique numeric;
