-- Ajoute les colonnes Test labo manquantes sur production_rapports (V1),
-- deja presentes sur V2. couleur/remarque/stabilite/odeur/texture/nom_labo
-- sont du texte libre ou une valeur fermee (select), les *_min/*_max de
-- articles_specs_qualite existent deja et n'ont pas besoin de migration.
alter table public.production_rapports
  add column if not exists couleur text,
  add column if not exists remarque text,
  add column if not exists utilisateur_test_labo text,
  add column if not exists date_saisie_test_labo timestamptz,
  add column if not exists taux_humidite numeric,
  add column if not exists pression_atmospherique numeric,
  add column if not exists texture text,
  add column if not exists nom_labo text,
  add column if not exists date_prise_echantillon date,
  add column if not exists heure_prise_echantillon text,
  add column if not exists heure_debut_analyse text,
  add column if not exists heure_fin_analyse text,
  add column if not exists temperature_test numeric,
  add column if not exists odeur text,
  add column if not exists disposition_qualite text;
