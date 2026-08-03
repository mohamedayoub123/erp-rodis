-- Champs specifiques au rapport Fabrication (vrac) - distinct du rapport
-- Conditionnement (carton) deja existant sur la meme table.
-- Les cuves sont numerotees individuellement (pas juste "cuve 1/2/3/4") -
-- une preparation utilise au plus 4 cuves parmi tout le parc, donc chaque
-- emplacement porte son propre "numero de cuve" + son poids.
alter table public.production_rapports
  add column if not exists machine text,
  add column if not exists preparateur text,
  add column if not exists cuve_1_numero text,
  add column if not exists cuve_1_poids numeric,
  add column if not exists cuve_2_numero text,
  add column if not exists cuve_2_poids numeric,
  add column if not exists cuve_3_numero text,
  add column if not exists cuve_3_poids numeric,
  add column if not exists cuve_4_numero text,
  add column if not exists cuve_4_poids numeric,
  add column if not exists temps_debut_preparation text,
  add column if not exists temps_envoi_echantillon_labo text,
  add column if not exists temps_fin_test text,
  add column if not exists temps_vidange text,
  add column if not exists ph numeric,
  add column if not exists densite numeric,
  add column if not exists viscosite numeric,
  add column if not exists stabilite numeric;

-- Un seul rapport evolutif par ligne de programme : Fabrication et
-- Conditionnement remplissent le MEME rapport (identifie par sa ligne,
-- donc par le meme code), peu importe lequel est rempli en premier. On
-- garde seulement le rapport le plus recent par ligne avant d'ajouter la
-- contrainte, au cas ou des tests precedents auraient cree des doublons.
delete from public.production_rapports a
using public.production_rapports b
where a.programme_ligne_id = b.programme_ligne_id
  and a.id < b.id;

alter table public.production_rapports
  drop constraint if exists production_rapports_ligne_unique;

alter table public.production_rapports
  add constraint production_rapports_ligne_unique unique (programme_ligne_id);
