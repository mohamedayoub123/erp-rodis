-- A coller dans Supabase Dashboard > SQL Editor > New query, PROJET DEV/V2.
--
-- Nouvelle colonne pour suivre combien de vrac a deja ete reellement sorti
-- du Depot B pour le Conditionnement de ce code (calcule au prorata des
-- cartons produits) - necessaire pour ne jamais sortir deux fois la meme
-- part si le rapport est resaisi/corrige. Sans danger a relancer plusieurs
-- fois.
alter table public.production_rapports add column if not exists vrac_consomme numeric not null default 0;
