-- A coller dans Supabase Dashboard > SQL Editor > New query.
-- Ajoute Longueur/Largeur/Hauteur/Poids net/Poids brut sur les articles
-- (Produit Fini ET Matiere Premiere) - demande explicite, editable depuis
-- la fiche Produit (/produit/[type]/[id]).
--
-- Idempotent (peut etre relance sans risque) - colonnes nullable,
-- aucune donnee existante modifiee.
alter table public.articles
  add column if not exists longueur numeric,
  add column if not exists largeur numeric,
  add column if not exists hauteur numeric,
  add column if not exists poids_net numeric,
  add column if not exists poids_brut numeric;

alter table public.articles_matiere_premiere
  add column if not exists longueur numeric,
  add column if not exists largeur numeric,
  add column if not exists hauteur numeric,
  add column if not exists poids_net numeric,
  add column if not exists poids_brut numeric;
