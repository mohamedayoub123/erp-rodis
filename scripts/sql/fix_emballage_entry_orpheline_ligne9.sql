-- A coller dans Supabase Dashboard > SQL Editor > New query, PROJET DEV/V2.
--
-- Bug trouve : mes 2 scripts de reset du programme de test (MB.2026.1,
-- ligne 9) ont efface production_code_termine/production_mp_reserve/
-- production_rapports/production_vrac_entries/production_carton_entries,
-- mais PAS production_emballage_entries - une ligne orpheline d'un test
-- precedent (code AA4200V, 300 emballes) est restee en base. Le Dashboard
-- calcule emballageRestant = emballagePrevu (carton produit CETTE fois) -
-- emballageProduit (cette vieille ligne) = 0, donc AA4200V n'apparait plus
-- dans la colonne Emballage alors que le Conditionnement vient d'etre
-- refait a neuf.
delete from public.production_emballage_entries
where programme_ligne_id = 9;

-- Verification (doit renvoyer 0 ligne)
select * from public.production_emballage_entries where programme_ligne_id = 9;
