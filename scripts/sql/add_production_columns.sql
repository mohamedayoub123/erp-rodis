-- A coller dans Supabase Dashboard > SQL Editor > New query.
-- Ajoute les colonnes de parametres de production (venant de la feuille
-- "Data" du fichier GFPC-ENR-032 Fabrication et Conditionnement) sur la
-- table articles existante. volume_unitaire/volume_stockage existent deja.
alter table public.articles
  add column if not exists cadence numeric,
  add column if not exists nb_carton_par_vrac numeric,
  add column if not exists max_production_vrac_8h numeric,
  add column if not exists contenance numeric,
  add column if not exists nb_piece_par_max_vrac numeric,
  add column if not exists piece_par_carton numeric,
  add column if not exists min_vrac numeric,
  add column if not exists max_vrac_auto numeric,
  add column if not exists vrac_max_manuel numeric,
  add column if not exists dispenseur_pcs_carton numeric,
  add column if not exists besoin_pot_flacon boolean not null default false,
  add column if not exists besoin_capsule boolean not null default false,
  add column if not exists besoin_sleeve boolean not null default false,
  add column if not exists besoin_dispenseur boolean not null default false,
  add column if not exists besoin_carton boolean not null default false,
  add column if not exists besoin_etiquette boolean not null default false,
  add column if not exists besoin_etui boolean not null default false,
  add column if not exists code_auto text,
  add column if not exists code_manu text;
