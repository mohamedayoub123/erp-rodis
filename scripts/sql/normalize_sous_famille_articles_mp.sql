-- Articles MP : regroupe les variantes orthographiques de sous_famille sous
-- 3 libelles uniques - demande explicite. Ne touche jamais "categorie"
-- (donnee brute d'origine), seulement "sous_famille" (deja backfillee depuis
-- categorie par add_sous_famille_articles_mp.sql).

update articles_matiere_premiere
set sous_famille = 'COLORANT PLASTIQUE'
where sous_famille in ('COL PLAST', 'COLO PLASTIQUE', 'COLORANT PLAS.');

update articles_matiere_premiere
set sous_famille = 'COLORANT COSMETIQUE'
where sous_famille = 'Col_cosm';

update articles_matiere_premiere
set sous_famille = 'MP COSMETIQUE'
where sous_famille in ('MP', 'mp cosm', 'DETERGENT');
