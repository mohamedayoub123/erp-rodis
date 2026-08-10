-- A coller dans Supabase Dashboard > SQL Editor > New query, PROJET DEV/V2.
--
-- 3e remise a zero du meme programme de test (MB.2026.1, programme_ligne_id=9,
-- codes AA4199V et AA4200V) - pour rejouer tout le circuit avec les
-- dernieres corrections (carton toujours arrondi au superieur, statut
-- qualite Test labo, vrac recupere avec deduction reelle du stock).
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

-- 4) Journal vrac/carton/emballage + historique destruction
delete from public.production_vrac_entries
where programme_ligne_id = 9;
delete from public.production_carton_entries
where programme_ligne_id = 9;
delete from public.production_emballage_entries
where programme_ligne_id = 9;
delete from public.production_destruction_history
where programme_ligne_id = 9;

-- 5) Stock reel vrac genere par ce test (vrac lait white secret)
delete from public.lots_stock
where id in (248285, 248286, 248287, 248288);

-- 6) Matiere premiere reellement sortie du Depot B pour ce test (16 lignes
-- "Consommation production" du pesage AA4199V/AA4200V - IDs verifies
-- precisement avant cette correction).
delete from public.lots_stock_matiere_premiere
where id in (
  40414, 40415, 40416, 40417, 40418, 40419, 40420, 40421,
  40422, 40423, 40424, 40425, 40426, 40427, 40428, 40429
);

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
select 'production_emballage_entries', count(*) from public.production_emballage_entries where programme_ligne_id = 9
union all
select 'production_destruction_history', count(*) from public.production_destruction_history where programme_ligne_id = 9
union all
select 'lots_stock vrac', count(*) from public.lots_stock where id in (248285, 248286, 248287, 248288)
union all
select 'lots_stock_matiere_premiere', count(*) from public.lots_stock_matiere_premiere
where id in (40414, 40415, 40416, 40417, 40418, 40419, 40420, 40421, 40422, 40423, 40424, 40425, 40426, 40427, 40428, 40429);
