-- A coller dans Supabase Dashboard > SQL Editor > New query.
--
-- Vide toute la quantite (entree/sortie) qui existe dans Depot B, MP et PF,
-- pour repartir a zero sur ce depot pour le test propre en V2. Ne touche
-- aucun autre depot (Depot E, Depot A...).
delete from public.lots_stock_matiere_premiere
where depot_id = (select id from public.depots where nom ilike 'Depot B' limit 1);

delete from public.lots_stock
where depot_id = (select id from public.depots where nom ilike 'Depot B' limit 1);
