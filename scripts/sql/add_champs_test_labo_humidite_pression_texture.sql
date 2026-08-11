-- A coller dans Supabase Dashboard > SQL Editor > New query, PROJET DEV/V2.
--
-- Ajoute au Test labo (production_rapports) : taux d'humidite, pression
-- atmospherique, texture, le nom du labo (rempli automatiquement, jamais
-- tape a la main - meme principe que utilisateur_test_labo), et les
-- horaires de prelevement/analyse. Ajoute aussi les bornes spec (min/max)
-- pour taux d'humidite et pression atmospherique + la texture attendue sur
-- articles_specs_qualite, pour permettre le meme calcul "hors spec" que
-- pH/viscosite/densite/degre alcool.
alter table public.production_rapports
  add column if not exists taux_humidite numeric;

alter table public.production_rapports
  add column if not exists pression_atmospherique numeric;

alter table public.production_rapports
  add column if not exists texture text;

alter table public.production_rapports
  add column if not exists nom_labo text;

alter table public.production_rapports
  add column if not exists date_prise_echantillon date;

alter table public.production_rapports
  add column if not exists heure_prise_echantillon text;

alter table public.production_rapports
  add column if not exists heure_debut_analyse text;

alter table public.production_rapports
  add column if not exists heure_fin_analyse text;

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
where table_schema = 'public' and table_name = 'production_rapports'
  and column_name in (
    'taux_humidite', 'pression_atmospherique', 'texture', 'nom_labo',
    'date_prise_echantillon', 'heure_prise_echantillon', 'heure_debut_analyse', 'heure_fin_analyse'
  );

select column_name from information_schema.columns
where table_schema = 'public' and table_name = 'articles_specs_qualite'
  and column_name in ('taux_humidite_min', 'taux_humidite_max', 'pression_atmospherique_min', 'pression_atmospherique_max', 'texture');
