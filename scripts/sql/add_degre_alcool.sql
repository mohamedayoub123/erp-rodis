-- A coller dans Supabase Dashboard > SQL Editor > New query.
-- Ajoute le degre d'alcool au controle qualite de Fabrication (test labo),
-- a cote de pH/Densite/Viscosite/Stabilite deja suivis.
alter table public.production_rapports
  add column if not exists degre_alcool numeric;
