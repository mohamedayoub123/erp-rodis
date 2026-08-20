-- A coller dans Supabase Dashboard > SQL Editor > New query.
-- Ajoute le nombre de journaliers sur le poste Fabrication (meme motif que
-- nb_journaliers_conditionnement/nb_journaliers_emballage dans
-- add_nb_journaliers.sql) - necessaire pour chiffrer le cout main d'oeuvre
-- reel de la Fabrication dans le calculateur "cout reel"
-- (lib/cout-production-reel.ts).
--
-- Idempotent (peut etre relance sans risque) - colonne nullable, aucune
-- donnee existante modifiee.
alter table public.production_rapports
  add column if not exists nb_journaliers_fabrication numeric;
