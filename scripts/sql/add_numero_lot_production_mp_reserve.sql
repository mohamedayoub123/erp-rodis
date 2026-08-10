-- A coller dans Supabase Dashboard > SQL Editor > New query, PROJET DEV/V2.
-- Chaque matiere premiere reservee a la validation (Salle de pesage /
-- conditionnement) doit avoir SON PROPRE numero de lot, distinct du
-- code/batch du produit fini (jusqu'ici, toutes les MP consommees pour un
-- code partageaient a tort le meme numero de lot que le code lui-meme).
alter table public.production_mp_reserve add column if not exists numero_lot text;
