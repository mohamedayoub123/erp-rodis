-- A coller dans Supabase Dashboard > SQL Editor > New query, PROJET V1/PRODUCTION
-- (URL doit commencer par srqtpohpqxyzfsznunhs, PAS ffejeentvwkoslzmnsbk qui
-- est V2/dev).
--
-- Ajoute a Specs Labo (Vrac) les bornes min/max pour taux d'humidite et
-- pression atmospherique, plus la texture attendue - meme ajout que sur V2.
-- V1 n'a pas le module Test labo/Fabrication (specifique a V2), donc pas de
-- colonnes a ajouter sur production_rapports ici.
alter table public.articles_specs_qualite
  add column if not exists taux_humidite_min numeric;

alter table public.articles_specs_qualite
  add column if not exists taux_humidite_max numeric;

alter table public.articles_specs_qualite
  add column if not exists pression_atmospherique_min numeric;

alter table public.articles_specs_qualite
  add column if not exists pression_atmospherique_max numeric;

alter table public.articles_specs_qualite
  add column if not exists texture text;

-- Verification
select column_name from information_schema.columns
where table_schema = 'public' and table_name = 'articles_specs_qualite'
  and column_name in ('taux_humidite_min', 'taux_humidite_max', 'pression_atmospherique_min', 'pression_atmospherique_max', 'texture');
