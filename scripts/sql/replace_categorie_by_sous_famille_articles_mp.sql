-- Articles MP : remplace categorie par la valeur (deja nettoyee/regroupee)
-- de sous_famille - demande explicite. Verifie avant envoi : aucune ligne
-- n'a categorie rempli avec sous_famille vide (le backfill initial couvre
-- tout le monde), donc aucune perte de donnee.

update articles_matiere_premiere
set categorie = sous_famille;
