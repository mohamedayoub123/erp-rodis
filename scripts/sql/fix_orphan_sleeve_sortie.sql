-- A coller dans Supabase Dashboard > SQL Editor > New query.
--
-- Ligne orpheline : sortie de 5000 SLEEVE LAIT WHITE SECRET 200ML (Depot E,
-- 09-08-2026, note "Transfer Order") laissee par un Transfer Invoice
-- supprime avant que le nettoyage automatique du stock existe pour les
-- anciennes lignes (corrige depuis). Aucune entree correspondante n'existe
-- - ce demi-mouvement n'a plus de sens, seul cet id precis est efface.
delete from public.lots_stock_matiere_premiere where id = 3;
