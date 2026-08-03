-- Suivi Tirage : historique importe depuis GFPC-ENR-007_SUIVI_PRODUCTION.xlsx
-- (feuille "SUIVI TIRAGE") - un log par lot/poste de conditionnement.
--
-- programme_ligne_id est optionnel : rempli quand code_labo correspond a un
-- numero_lot deja connu dans programme_lignes (le numero_lot peut contenir
-- plusieurs codes separes par virgule - le rapprochement se fait cote script
-- d'import, pas ici). Sans correspondance, la ligne est quand meme importee,
-- avec zone/chaine/produit/gamme repris tels quels de l'Excel (ou de la
-- fiche article par nom quand possible).

create table if not exists public.suivi_tirage (
  id bigint generated always as identity primary key,
  programme_ligne_id bigint references public.programme_lignes(id) on delete set null,
  code_labo text not null,
  programme_de_production text,
  date_jour date,
  zone text,
  chaine text,
  produit text,
  gamme text,
  type_article text,
  piece_par_carton numeric,
  chef_zone text,
  chef_ligne text,
  tireur text,
  cadence numeric,
  poids_reel numeric,
  qt_carton numeric,
  qt_fabriquer numeric,
  arret_depot numeric,
  arret_consommable_non_livre numeric,
  arret_manque_conditionnement numeric,
  arret_manque_vrac numeric,
  arret_technique numeric,
  arret_coupure_courant numeric,
  arret_raclage_vrac numeric,
  arret_changement_lot numeric,
  arret_flacons_nc numeric,
  arret_autre numeric,
  temps_demarage_lot text,
  temps_arret_batch text,
  source_fichier text,
  created_at timestamptz not null default now()
);

create index if not exists suivi_tirage_programme_ligne_idx on public.suivi_tirage (programme_ligne_id);
create index if not exists suivi_tirage_code_labo_idx on public.suivi_tirage (code_labo);
create index if not exists suivi_tirage_date_idx on public.suivi_tirage (date_jour);
create index if not exists suivi_tirage_zone_chaine_idx on public.suivi_tirage (zone, chaine);
