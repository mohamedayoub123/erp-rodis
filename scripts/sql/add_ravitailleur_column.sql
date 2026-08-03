-- A coller dans Supabase Dashboard > SQL Editor > New query.
-- Ajoute la colonne "Ravitailleur" (personne qui approvisionne la ligne)
-- sur programme_lignes.
alter table public.programme_lignes
  add column if not exists ravitailleur text;
