-- A coller dans Supabase Dashboard > SQL Editor > New query.
-- Colonnes "TON" et "SECTION" des equipements de la Production Plastique (fichier NUMERO DE MACHINE.xlsx) :
--   ton     = tonnage de la machine a injecter (320, 400...) ou nombre de tetes du soufflage (2 TETE, 4 TETE...)
--   section = INJ, INJ PET, SOUFF, PET SOUFF, IBM...
--
-- Idempotent (peut etre relance sans risque) - colonnes nullables, aucune donnee existante modifiee.
alter table public.equipements_plastique
  add column if not exists ton text,
  add column if not exists section text;
