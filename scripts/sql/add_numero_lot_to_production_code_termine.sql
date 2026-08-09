-- A coller dans Supabase Dashboard > SQL Editor > New query.
--
-- Numero de lot reel (attribue au moment du "Valider" depuis Salle de
-- pesage/Salle de conditionnement) pour chaque code termine, vrac et
-- conditionnement separement (une ligne par (programme_ligne_id, code,
-- stage) existe deja dans cette table).
alter table public.production_code_termine
  add column if not exists numero_lot text;
