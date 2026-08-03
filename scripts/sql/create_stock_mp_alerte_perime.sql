-- Stock Alert MP : seuils d'alerte par article, feuille Excel "Alerte".
create table if not exists public.stock_alertes_matiere_premiere (
  id bigint generated always as identity primary key,
  nom_article text not null,
  article_normalise text not null,
  categorie text,
  stock_actuel numeric,
  seuil_alerte numeric,
  conso_3_mois numeric,
  conso_12_mois numeric,
  cmd_bc numeric,
  cmd_import numeric,
  date_logistique text,
  observation text,
  created_at timestamptz not null default now()
);

alter table public.stock_alertes_matiere_premiere
  drop constraint if exists stock_alertes_mp_normalise_key;

alter table public.stock_alertes_matiere_premiere
  add constraint stock_alertes_mp_normalise_key unique (article_normalise);

-- Lots MP (Actif/Perime) : feuille Excel "Etat_Lots" - un seul lot par
-- article dans cette feuille (pas une ligne par mouvement), donc l'article
-- normalise suffit comme cle. Sert de base pour la page Stock Perime, et
-- reutilisable plus tard pour Stock Dormant une fois sa logique decidee.
create table if not exists public.lots_matiere_premiere (
  id bigint generated always as identity primary key,
  nom_article text not null,
  article_normalise text not null,
  numero_lot text,
  date_reception date,
  date_expiration date,
  mois_en_stock numeric,
  stock_actuel numeric,
  etat text,
  created_at timestamptz not null default now()
);

alter table public.lots_matiere_premiere
  drop constraint if exists lots_matiere_premiere_normalise_key;

alter table public.lots_matiere_premiere
  add constraint lots_matiere_premiere_normalise_key unique (article_normalise);
