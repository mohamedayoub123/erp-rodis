-- A coller dans Supabase Dashboard > SQL Editor > New query, PROJET DEV/V2.
--
-- Ajoute les bornes spec (min/max) pour la temperature sur
-- articles_specs_qualite, pour permettre le meme calcul "hors spec" que
-- pH/viscosite/densite/degre alcool/taux humidite/pression atmospherique.
-- Le champ temperature_test existe deja sur production_rapports (Test
-- labo) mais n'avait encore aucune borne de comparaison.
alter table public.articles_specs_qualite
  add column if not exists temperature_min numeric;

alter table public.articles_specs_qualite
  add column if not exists temperature_max numeric;

-- Verification
select column_name from information_schema.columns
where table_schema = 'public' and table_name = 'articles_specs_qualite'
  and column_name in ('temperature_min', 'temperature_max');
