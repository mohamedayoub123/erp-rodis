-- A coller dans Supabase Dashboard > SQL Editor > New query.
-- Ajoute le lien vers la machine de Fabrication choisie sur une ligne de
-- "Programme par ligne" (app/programe-par-ligne) - jusqu'ici aucune machine
-- de Fabrication n'etait associee a une ligne de programme.
--
-- Idempotent (peut etre relance sans risque) - colonne nullable, aucune
-- donnee existante modifiee.
alter table public.programme_lignes
  add column if not exists machine_fabrication_id integer references public.machines(id);
