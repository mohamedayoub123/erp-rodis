-- A coller dans Supabase Dashboard > SQL Editor > New query, puis Run.

-- programme_lignes.produit est un texte fige au moment de la creation du
-- programme (pas relie en direct a articles.nom_article) - le renommage
-- "PRERFECT GLOW" -> "PERFECT GLOW" fait plus tot sur la table articles
-- n'a donc pas mis a jour les 26 programmes deja crees avec l'ancienne
-- orthographe, les rendant invisibles aux recherches/filtres par
-- "Perfect Glow" (Dashboard Production, Tableau de commande...).
-- Cette requete est une simple correction de texte (UPDATE), aucune
-- suppression, aucun risque de perte de donnees.
update public.programme_lignes
set produit = replace(produit, 'PRERFECT', 'PERFECT')
where produit ilike '%prerfect%';
