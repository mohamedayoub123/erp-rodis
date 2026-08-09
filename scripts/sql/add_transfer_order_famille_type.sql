-- A coller dans Supabase Dashboard > SQL Editor > New query.
--
-- Sur les Transfer Order crees automatiquement depuis "Verifier Stock" :
-- famille_produit (Clarifiant, Gel douche - Gel, Savon...) et type_mp (MP =
-- Base/Colorant/MP generique, Conditionnement = Sleeve/Carton/Spray/Pump...)
-- - affiches sur la liste/detail du Transfer Order. Restent NULL pour un
-- Transfer Order cree manuellement.
alter table public.transfer_orders
  add column if not exists famille_produit text,
  add column if not exists type_mp text;
