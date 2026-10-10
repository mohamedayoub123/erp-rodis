-- Colonne "Saisi par" (qui a cree la ligne) sur NC Confidentiel et TAF Confidentiel.
-- A coller dans Supabase Dashboard > SQL Editor > New query.
-- Rempli automatiquement avec l'utilisateur connecte a chaque nouvelle NC / TAF. Les lignes deja existantes restent vides.
alter table public.qualite_nc_confidentiel
  add column if not exists saisi_par text;

alter table public.qualite_taf_confidentiel
  add column if not exists saisi_par text;
