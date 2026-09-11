-- Correction et Action Corrective (AC) deviennent chacune une liste
-- d'entrees datees (au lieu d'un seul champ texte) - demande explicite :
-- pouvoir ajouter une 2eme/3eme entree au fil du temps, chacune avec ses
-- propres fichiers joints. Les anciennes colonnes texte (correction,
-- action_corrective_ac) restent en base telles quelles (historique deja
-- saisi), simplement plus jamais ecrites - seules ces 2 nouvelles colonnes
-- JSONB sont utilisees desormais par la page detail.
alter table qualite_nc_confidentiel
  add column if not exists correction_entries jsonb not null default '[]'::jsonb,
  add column if not exists action_corrective_ac_entries jsonb not null default '[]'::jsonb;
