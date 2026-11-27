-- A coller dans Supabase Dashboard > SQL Editor > New query.
-- Conditionnement "Entree par ligne" : deux nouveaux champs par fournee.
--   dechet_vrac : vrac jete, en KG (a part des dechets en PIECES : sleeve, capsule...).
--   code_pays   : le "Code Ouganda" ; il se remplit ensuite tout seul dans Mouvements > Produit fini > Entree Production.
--
-- Idempotent - colonnes nullable, aucune donnee existante modifiee. Tant que ce script n'est pas lance, les deux champs
-- restent caches et tout fonctionne comme avant.
alter table public.production_carton_entries
  add column if not exists dechet_vrac numeric,
  add column if not exists code_pays text;
