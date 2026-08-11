-- A coller dans Supabase Dashboard > SQL Editor > New query, puis Run.

-- 3eme endroit trouve avec l'ancienne faute "PRERFECT GLOW" : la colonne
-- articles.article_normalise (utilisee pour retrouver un article a partir
-- du texte tape dans "Modifier cette commande") n'avait pas ete mise a
-- jour par le renommage precedent sur nom_article. Consequence concrete :
-- impossible d'enregistrer une modification sur une commande contenant un
-- article Perfect Glow (ex: commande 3933) - le texte de la ligne
-- ("Lait PERFECT GLOW 500ml") ne correspondait plus a aucune cle connue,
-- ce qui faisait planter la sauvegarde.
update public.articles
set article_normalise = replace(article_normalise, 'PRERFECT', 'PERFECT')
where article_normalise ilike '%prerfect%';
