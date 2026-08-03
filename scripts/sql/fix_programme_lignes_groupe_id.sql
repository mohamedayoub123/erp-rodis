-- A coller dans Supabase Dashboard > SQL Editor > New query.
-- Corrige programme_lignes.groupe_id : le code insere d'abord les lignes
-- SANS groupe_id puis fait un UPDATE pour le remplir avec le min(id) du lot
-- (meme pattern que mouvement_groupe_id dans lots_stock) - la colonne doit
-- donc etre nullable, pas "not null".
alter table public.programme_lignes
  alter column groupe_id drop not null;
