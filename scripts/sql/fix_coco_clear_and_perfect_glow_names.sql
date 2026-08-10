-- A coller dans Supabase Dashboard > SQL Editor > New query, puis Run.

-- 1) Coco Clear : "Lait Coco Clear 200ml/500ml" existaient en double sous
--    le mauvais nom "Lait cocoa clear". Migre les 2 lignes de commande
--    (proforma 3857) qui utilisaient encore les fiches en double vers les
--    bonnes fiches, puis supprime les doublons. Aucune autre table
--    (lots_stock, programme_lignes, famille_besoins) ne les referencait.
update public.commande_lignes set article_id = 328 where article_id = 331; -- Lait Coco Clear 200ml
update public.commande_lignes set article_id = 163 where article_id = 333; -- Lait Coco Clear 500ml

delete from public.articles where id in (331, 333);

-- 2) Perfect Glow : faute de frappe "PRERFECT GLOW" dans le nom de 20
--    articles (la gamme elle-meme etait deja correcte "PERFECT GLOW").
--    Une seule correction ici suffit partout (Stock, Tableau de commande,
--    Articles...) puisque ces pages affichent toutes le meme nom_article.
update public.articles
set nom_article = replace(nom_article, 'PRERFECT', 'PERFECT')
where nom_article ilike '%prerfect%';
