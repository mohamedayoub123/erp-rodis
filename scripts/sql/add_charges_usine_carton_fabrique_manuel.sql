-- Nb carton fabrique saisi a la main - sert de repli pour le Graphe Cout par
-- Carton sur les mois anciens ou Suivi Production n'a pas la donnee reelle.
-- A executer dans Supabase Dashboard > SQL Editor.
alter table public.charges_usine add column if not exists carton_fabrique_manuel numeric;
