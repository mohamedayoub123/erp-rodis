-- A coller dans Supabase Dashboard > SQL Editor > New query.
-- "Entree par ligne" du Conditionnement : en plus de l'Entree simple, une fournee peut etre saisie
-- par la ligne elle-meme avec 10 releves de poids, 10 releves de cadence (toutes les 15 min, la
-- moyenne va dans poids_reel / cadence comme avant) et jusqu'a 200 casiers coches (casiers_coches)
-- avec le nb de pieces par casier (pieces_par_casier) - le nb de cartons est calcule a partir de ca.
--
-- mode_saisie : vide = Entree simple (toutes les fournees deja saisies), 'par_ligne' = Entree par ligne.
-- Un meme code ne peut jamais avoir les deux (verifie par l'application).
--
-- Idempotent - colonnes nullable, aucune donnee existante modifiee.
alter table public.production_carton_entries
  add column if not exists mode_saisie text,
  add column if not exists releves_poids jsonb,
  add column if not exists releves_cadence jsonb,
  add column if not exists casiers_coches jsonb,
  add column if not exists pieces_par_casier numeric;
