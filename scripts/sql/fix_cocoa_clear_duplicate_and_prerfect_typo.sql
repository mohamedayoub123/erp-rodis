-- A coller dans Supabase Dashboard > SQL Editor > New query, PROJET DEV/V2 uniquement.
-- V1 n'a AUCUN de ces 2 problemes (verifie avant d'ecrire ce script) :
-- pas de doublon "Lait cocoa clear", et "PERFECT GLOW" deja bien orthographie.

-- ============================================================
-- 1) Doublon "Lait cocoa clear 200/300/500ml" (articles 331/332/333)
--    vs "Lait Coco Clear 200/300/500ml" (articles 328/289/163).
--    Aucun stock sur les 3 doublons (verifie), donc rien a fusionner
--    cote stock. MAIS la commande #239 (proforma 3857, AMA TCHAD,
--    EN_COURS) a 2 lignes pointant sur les doublons - reaffectees vers
--    les vrais articles avant suppression pour ne pas casser la commande.
-- ============================================================

update commande_lignes set article_id = 328 where id = 8339; -- 200ml : cocoa(331) -> coco(328)
update commande_lignes set article_id = 163 where id = 8338; -- 500ml : cocoa(333) -> coco(163)
-- (article 332 "300ml" cocoa : aucune reference nulle part, rien a reaffecter)

delete from articles where id in (331, 332, 333);

-- ============================================================
-- 2) Faute de frappe "PRERFECT GLOW" -> "PERFECT GLOW" (20 articles,
--    uniquement le nom - la gamme etait deja correcte).
-- ============================================================

update articles
set nom_article = replace(nom_article, 'PRERFECT', 'PERFECT')
where nom_article ilike '%PRERFECT%';

-- ============================================================
-- Verification (a lancer apres, doit renvoyer 0 ligne pour les 2)
-- ============================================================
select id, nom_article from articles where id in (331, 332, 333); -- doit etre vide
select id, nom_article from articles where nom_article ilike '%PRERFECT%'; -- doit etre vide
