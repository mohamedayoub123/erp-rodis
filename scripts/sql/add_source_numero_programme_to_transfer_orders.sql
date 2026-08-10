-- A coller dans Supabase Dashboard > SQL Editor > New query.
--
-- Garde quel programme (MB) a genere ce Transfer Order via "Creer les
-- Transfer Order" (Verifier Stock) - permet de bloquer un nouveau clic sur
-- ce bouton si le programme est deja entierement couvert par des Transfer
-- Order existants, sauf si ceux-ci ont ete supprimes ou ne couvraient pas
-- tout le besoin.
alter table public.transfer_orders add column if not exists source_numero_programme integer;
