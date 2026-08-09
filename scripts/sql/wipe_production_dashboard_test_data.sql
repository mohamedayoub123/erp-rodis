-- A coller dans Supabase Dashboard > SQL Editor > New query.
--
-- Vide TOUTES les donnees de test du pipeline Programme -> Dispatch ->
-- Dashboard/Calendrier Production, pour repartir sur un test propre en V2.
-- Ordre de suppression respecte les dependances (enfants avant parents).
--
-- NE TOUCHE PAS : Entrepot (Transfer Order/Transfer Invoice/stock),
-- articles/recettes (donnees maitres), Commandes, Import/BC MP.

-- 1. Suivi par code (Fin programme par etape)
delete from public.production_code_termine;

-- 2. Rapports de saisie (Fabrication/Conditionnement/Emballage)
delete from public.production_rapports;

-- 3. Historique quantites produites par code
delete from public.production_carton_entries;
delete from public.production_vrac_entries;
delete from public.production_emballage_entries;

-- 4. Lignes miroir lues par Dashboard/Calendrier
delete from public.programme_lignes;

-- 5. Lignes dispatchees (page Dispatch / historique)
delete from public.programme_dispatcher_lignes;

-- 6. Programmes (MB) source
delete from public.programmes;
