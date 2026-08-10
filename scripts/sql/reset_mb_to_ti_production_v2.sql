-- A coller dans Supabase Dashboard > SQL Editor > New query, PROJET DEV/V2 UNIQUEMENT.
-- Remet a zero : tous les Programme (MB), tout le suivi de production qui
-- en decoule (Suivi Production/Dashboard, Salle de pesage/conditionnement,
-- Test labo, Ravitailleur/dispatcher), et tous les Transfer Order + Transfer
-- Invoice - PLUS les vrais mouvements de stock que ces TO/TI/production ont
-- deja crees (les 6 TO sont tous "poste", les 6 TI tous "valide" : du stock
-- a deja bouge pour de vrai).
--
-- Cible precisement par la note systeme auto-generee (jamais le texte tape
-- a la main par un utilisateur) - ne touche PAS :
--   - l'historique Excel importe (source_import = 'excel:historique-mp')
--   - les entrees/sorties manuelles via Mouvements MP/PF (web:entree-mp,
--     web:sortie-mp, etc.)

-- ============================================================
-- 1) Mouvements de stock reels crees par cette activite de test
-- ============================================================
delete from public.lots_stock_matiere_premiere where note = 'Transfer Order';
delete from public.lots_stock where note = 'Transfer Order';

delete from public.lots_stock_matiere_premiere where note = 'Consommation production';
delete from public.lots_stock where note = 'Fabrication vrac';
delete from public.lots_stock where note = 'Consommation conditionnement';
delete from public.lots_stock_matiere_premiere where note ilike 'Ajustement qualite fabrication%';

-- ============================================================
-- 2) Transfer Invoice (TI)
-- ============================================================
delete from public.invoice_order_lignes;
delete from public.invoice_orders;

-- ============================================================
-- 3) Transfer Order (TO)
-- ============================================================
delete from public.transfer_order_ligne_lots;
delete from public.transfer_order_lignes;
delete from public.transfer_orders;

-- ============================================================
-- 4) Suivi de production (Dashboard, Salle de pesage/conditionnement,
--    Test labo, Entrer Fabrication/Conditionnement/Emballage)
-- ============================================================
delete from public.production_mp_reserve;
delete from public.production_code_termine;
delete from public.production_rapports;
delete from public.production_vrac_entries;
delete from public.production_carton_entries;
delete from public.production_emballage_entries;

-- ============================================================
-- 5) Ravitailleur / dispatcher
-- ============================================================
delete from public.programme_dispatcher_history;
delete from public.programme_dispatcher_lignes;
delete from public.pending_article_code_updates;

-- ============================================================
-- 6) Programme (MB) + miroir Programme par ligne (TOUTES les lignes,
--    y compris les fiches manuelles "+" du Dashboard)
-- ============================================================
delete from public.programme_lignes;
delete from public.programmes;

-- ============================================================
-- Verification (a lancer apres, tout doit etre a 0)
-- ============================================================
select
  (select count(*) from public.programmes) as programmes,
  (select count(*) from public.programme_lignes) as programme_lignes,
  (select count(*) from public.transfer_orders) as transfer_orders,
  (select count(*) from public.invoice_orders) as invoice_orders,
  (select count(*) from public.production_rapports) as production_rapports,
  (select count(*) from public.production_mp_reserve) as production_mp_reserve;
