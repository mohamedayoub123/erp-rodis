-- Rattrape les dernieres variantes de casse/espace non capturees par les
-- scripts precedents (ex: "Col_Cosm" avec un C majuscule, vs "Col_cosm" deja
-- traite) - applique aux 2 colonnes (categorie et sous_famille sont
-- synchronisees depuis le dernier script). upper(trim(...)) insensible a la
-- casse, sans risque si une valeur ne matche plus rien.

update articles_matiere_premiere
set categorie = 'COLORANT PLASTIQUE', sous_famille = 'COLORANT PLASTIQUE'
where upper(trim(categorie)) in ('COL PLAST', 'COLO PLASTIQUE', 'COLORANT PLAS.', 'COLORANT PLASTIQUE');

update articles_matiere_premiere
set categorie = 'COLORANT COSMETIQUE', sous_famille = 'COLORANT COSMETIQUE'
where upper(trim(categorie)) in ('COL_COSM', 'COL-COSM', 'COLORANT COSMETIQUE');

update articles_matiere_premiere
set categorie = 'MP COSMETIQUE', sous_famille = 'MP COSMETIQUE'
where upper(trim(categorie)) in ('MP', 'MP COSM', 'DETERGENT', 'MP COSMETIQUE');
