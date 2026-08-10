-- A coller dans Supabase Dashboard > SQL Editor > New query, PROJET DEV/V2.
-- Test labo : ajoute Temperature de test et Odeur (OK / Non OK).
-- "Stabilite" existant devient "Centrifuge" cote affichage seulement (meme
-- colonne stabilite, memes valeurs Stable/Non stable) - pas de SQL requis
-- pour ce renommage.
alter table public.production_rapports add column if not exists temperature_test numeric;
alter table public.production_rapports add column if not exists odeur text;
