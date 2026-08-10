-- A coller dans Supabase Dashboard > SQL Editor > New query, PROJET DEV/V2.
-- Nouveau flux "Test labo" separe du formulaire Fabrication (Entrer) :
-- couleur/remarque n'existaient pas encore, utilisateur/date de saisie pour
-- tracer qui a rempli le test (meme convention que utilisateur_fabrication).
alter table public.production_rapports add column if not exists couleur text;
alter table public.production_rapports add column if not exists remarque text;
alter table public.production_rapports add column if not exists utilisateur_test_labo text;
alter table public.production_rapports add column if not exists date_saisie_test_labo timestamptz;
