-- REPARATION : la premiere synchronisation (fichiers upsert 01-09 puis
-- le patch de rattrapage) a cree 1540 lignes EN DOUBLE au lieu de
-- mettre a jour les articles existants. Cause : la colonne
-- article_normalise deja en base garde les espaces (ex: "ACIDE CITRIQUE"),
-- alors que le script de sync generait une cle sans espaces (ex:
-- "ACIDECITRIQUE") - Postgres ne reconnaissait donc jamais l'article
-- existant et en creait un nouveau a chaque fois.
--
-- Ce script repare en gardant TOUJOURS la ligne d'origine (celle qui a
-- l'historique de stock/BC/recette, ou a defaut la plus ancienne),
-- copie les valeurs categorie/unite/gamme/gamme_statistique/stock min-max
-- de la ligne la plus recente (donnees Excel les plus a jour) sur cette
-- ligne d'origine, PUIS supprime les lignes en double. "utilisation"
-- (champ manuel, jamais dans le fichier Excel) n'est jamais touche.
--
-- 3 groupes ont ete exclus car 2 lignes ou plus ont chacune un vrai
-- historique de stock (fusion automatique risquee - a traiter a la main) :
--   - id 110 "BASE BAM 61034 (SWEET SCENT PEACH PARADISE)" (4 refs) vs id 6400 "BASE BAM 61034 (SWEET SCENT PEACH PARADISE)" (1 refs)
--   - id 219 "BASE SAV 41126" (40 refs) vs id 6477 "BASE SAV 41126" (1 refs)
--   - id 222 "BASE SAV 41433" (28 refs) vs id 6479 "BASE SAV 41433" (1 refs)
--
-- A executer DANS L'ORDRE : les fichiers 01 a 0N (update), PUIS le fichier
-- delete en dernier.
--
-- Partie 7 / 7 (update) : 16 articles.

update public.articles_matiere_premiere set categorie = 'TUBE', unite = 'pcs', gamme = 'BB CLEAR VITAMINE-C', gamme_statistique = 'BB CLEAR VITAMINE-C', min_stock = 18000, max_stock = 36000 where id = 4109;
update public.articles_matiere_premiere set categorie = 'TUBE', unite = 'pcs', gamme = 'COCO CLEAR', gamme_statistique = 'COCO CLEAR', min_stock = 0, max_stock = 0 where id = 4110;
update public.articles_matiere_premiere set categorie = 'TUBE', unite = 'pcs', gamme = 'ELIXIR', gamme_statistique = 'ELIXIR', min_stock = 36000, max_stock = 72000 where id = 4111;
update public.articles_matiere_premiere set categorie = 'TUBE', unite = 'pcs', gamme = 'Mentholée', gamme_statistique = 'MATRIX', min_stock = 18000, max_stock = 36000 where id = 4112;
update public.articles_matiere_premiere set categorie = 'TUBE', unite = 'pcs', gamme = 'PERFECT GLOW', gamme_statistique = 'PERFECT GLOW', min_stock = 72000, max_stock = 144000 where id = 4113;
update public.articles_matiere_premiere set categorie = 'TUBE', unite = 'pcs', gamme = 'PRECIOUS PERFECT', gamme_statistique = 'PRECIOUS PERFECT', min_stock = 36000, max_stock = 72000 where id = 4114;
update public.articles_matiere_premiere set categorie = 'TUBE', unite = 'pcs', gamme = 'WHITE SECRET', gamme_statistique = 'WHITE SECRET', min_stock = 108000, max_stock = 216000 where id = 4115;
update public.articles_matiere_premiere set categorie = 'TUBE', unite = 'pcs', gamme = 'DERMA TONE', gamme_statistique = 'DERMA TONE', min_stock = 0, max_stock = 0 where id = 4116;
update public.articles_matiere_premiere set categorie = 'TUBE', unite = 'pcs', gamme = 'Mentholée', gamme_statistique = 'DR JOHNSON', min_stock = 288000, max_stock = 576000 where id = 4117;
update public.articles_matiere_premiere set categorie = 'TUBE', unite = 'pcs', gamme = 'Mentholée', gamme_statistique = 'DR JOHNSON', min_stock = 54000, max_stock = 108000 where id = 4118;
update public.articles_matiere_premiere set categorie = 'TUBE', unite = 'pcs', gamme = 'Mentholée', gamme_statistique = 'DR JOHNSON', min_stock = 144000, max_stock = 288000 where id = 4119;
update public.articles_matiere_premiere set categorie = 'TUBE', unite = 'pcs', gamme = 'PRO-WHITE', gamme_statistique = 'PRO-WHITE', min_stock = 18000, max_stock = 36000 where id = 4120;
update public.articles_matiere_premiere set categorie = 'CAPSULES-IMP', unite = 'pcs', gamme = 'O DE FEMME', gamme_statistique = 'SPRAY', min_stock = 0, max_stock = 0 where id = 4121;
update public.articles_matiere_premiere set categorie = 'CAPSULES-IMP', unite = 'pcs', gamme = 'O DE FEMME', gamme_statistique = 'SPRAY', min_stock = 0, max_stock = 0 where id = 4122;
update public.articles_matiere_premiere set categorie = 'mp cosm', unite = 'kg', gamme = 'MP COSM', gamme_statistique = 'MP COSM', min_stock = 0, max_stock = 0 where id = 4123;
update public.articles_matiere_premiere set categorie = 'mp plastique', unite = 'kg', gamme = 'MP PLASTIQUE', gamme_statistique = 'MP PLASTIQUE', min_stock = 0, max_stock = 0 where id = 4124;
