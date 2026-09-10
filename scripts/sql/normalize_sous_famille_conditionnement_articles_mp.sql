-- Articles MP : regroupe les articles de conditionnement dans sous_famille -
-- demande explicite. Ne touche jamais "categorie" (donnee brute d'origine).
-- upper(trim(...)) pour rester insensible a la casse/espaces (ex: "pump" vs
-- "CAPSULES") et couvrir singulier/pluriel au cas ou (CAPSULE/CAPSULES,
-- ETUI/ETUIS...) - sans risque, une valeur absente ne matche simplement rien.

update articles_matiere_premiere
set sous_famille = 'ARTICLE DE CONDITIONNEMENT PLASTIQUE'
where upper(trim(sous_famille)) in ('CAPSULES', 'CAPSULE', 'FLACON', 'FLACONS PET', 'FLACON PET', 'POTS', 'POTS PET', 'TOPETTE');

update articles_matiere_premiere
set sous_famille = 'ARTICLE DE CONDITIONNEMENT COSMETIQUE'
where upper(trim(sous_famille)) in ('CARTON', 'ETIQUETTE', 'ETUIS', 'ETUI', 'FLACON VERRE', 'SLEEVE', 'PUMP', 'SPRAY', 'TUBE');
