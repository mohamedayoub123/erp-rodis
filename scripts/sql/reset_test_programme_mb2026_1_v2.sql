-- A coller dans Supabase Dashboard > SQL Editor > New query, PROJET DEV/V2.
--
-- Meme remise a zero que reset_test_programme_mb2026_1.sql, pour le meme
-- programme de test (MB.2026.1, programme_ligne_id=9, codes AA4199V et
-- AA4200V) - a refaire car le code de la Salle de conditionnement vient
-- d'etre corrige (elle doit a nouveau faire sortir le stock reel Depot B a
-- chaque "Entrer", comme la Fabrication - seul "Fin programme" libere sans
-- toucher au stock). Le test precedent (AA4200V) a tourne avec l'ancien
-- comportement (pas de sortie reelle sur le carton/sleeve) - ce reset
-- l'efface pour repartir propre avec le code corrige.
--
-- Le programme et sa ligne restent intacts. Les Transfer Order deja
-- postes/valides ne sont pas touches - le stock reste disponible.

-- 1) Reservations MP (Salle de pesage + Salle de conditionnement)
delete from public.production_mp_reserve
where production_code_termine_id in (
  select id from public.production_code_termine where programme_ligne_id = 9
);

-- 2) Validations "Terminer" (pesage, salle_conditionnement, vrac, carton)
delete from public.production_code_termine
where programme_ligne_id = 9;

-- 3) Rapports (Test labo + Fabrication + Conditionnement)
delete from public.production_rapports
where programme_ligne_id = 9;

-- 4) Journal vrac/carton
delete from public.production_vrac_entries
where programme_ligne_id = 9;
delete from public.production_carton_entries
where programme_ligne_id = 9;

-- 5) Stock reel vrac genere par ce test (vrac lait white secret)
delete from public.lots_stock
where article_id = 6343 and numero_lot in ('AA4199V', 'AA4200V');

-- 6) Matiere premiere reellement sortie du Depot B pour ce test (4 lignes
-- "Consommation production" du pesage AA4200V - IDs verifies precisement
-- avant cette correction).
delete from public.lots_stock_matiere_premiere
where id in (40410, 40411, 40412, 40413);

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
where id in (40410, 40411, 40412, 40413);
