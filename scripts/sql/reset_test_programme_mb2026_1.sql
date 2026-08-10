-- A coller dans Supabase Dashboard > SQL Editor > New query, PROJET DEV/V2.
--
-- Remet a zero le SEUL programme de test actuellement en base (MB.2026.1,
-- programme_id=13, programme_ligne_id=9, codes AA4199V et AA4200V,
-- "Lait WHITE SECRET 200ml") pour permettre de refaire tout le circuit
-- Salle de pesage -> Fabrication -> Salle de conditionnement ->
-- Conditionnement depuis le debut et observer le nouveau comportement de
-- la reservation MP (correction precedente : la Salle de conditionnement
-- libere la reservation sans faire sortir le stock reel).
--
-- Le programme (MB.2026.1) et sa ligne restent intacts (memes codes
-- AA4199V/AA4200V, memes quantites prevues) - seul l'AVANCEMENT de la
-- production est efface. Les Transfer Order/Invoice Order qui ont
-- approvisionne le Depot B (TO n1 et n2, deja "poste"/"valide") ne sont
-- PAS touches : ce stock reste disponible pour refaire le test.

-- 1) Reservations MP (Salle de pesage + Salle de conditionnement)
delete from public.production_mp_reserve
where production_code_termine_id in (
  select id from public.production_code_termine where programme_ligne_id = 9
);

-- 2) Validations "Terminer" (pesage, salle_conditionnement, vrac, carton)
delete from public.production_code_termine
where programme_ligne_id = 9;

-- 3) Rapports (Test labo + Fabrication + Conditionnement, un rapport par
-- code) - AA4199V et AA4200V redeviennent des fiches vierges.
delete from public.production_rapports
where programme_ligne_id = 9;

-- 4) Journal vrac/carton (alimente le "reste a produire" du Dashboard)
delete from public.production_vrac_entries
where programme_ligne_id = 9;
delete from public.production_carton_entries
where programme_ligne_id = 9;

-- 5) Stock reel vrac genere par ce test (Fabrication vrac + Consommation
-- conditionnement, article "vrac lait white secret") - remet le vrac a 0.
delete from public.lots_stock
where article_id = 6343 and numero_lot in ('AA4199V', 'AA4200V');

-- 6) Matiere premiere reellement sortie du Depot B pour ce test (les 12
-- lignes "Consommation production" generees par les validations Pesage ET
-- Salle de conditionnement de AA4199V/AA4200V - IDs verifies precisement
-- avant cette correction, aucune autre ligne touchee).
delete from public.lots_stock_matiere_premiere
where id in (40398, 40399, 40400, 40401, 40402, 40403, 40404, 40405, 40406, 40407, 40408, 40409);

-- Verification (doit renvoyer 0 ligne partout)
select 'production_mp_reserve' as t, count(*) from public.production_mp_reserve
where production_code_termine_id in (select id from public.production_code_termine where programme_ligne_id = 9)
union all
select 'production_code_termine', count(*) from public.production_code_termine where programme_ligne_id = 9
union all
select 'production_rapports', count(*) from public.production_rapports where programme_ligne_id = 9
union all
select 'production_vrac_entries', count(*) from public.production_vrac_entries where programme_ligne_id = 9
union all
select 'production_carton_entries', count(*) from public.production_carton_entries where programme_ligne_id = 9
union all
select 'lots_stock vrac', count(*) from public.lots_stock where article_id = 6343 and numero_lot in ('AA4199V', 'AA4200V')
union all
select 'lots_stock_matiere_premiere', count(*) from public.lots_stock_matiere_premiere
where id in (40398, 40399, 40400, 40401, 40402, 40403, 40404, 40405, 40406, 40407, 40408, 40409);
