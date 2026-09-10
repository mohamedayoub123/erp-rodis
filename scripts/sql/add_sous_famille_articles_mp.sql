-- Articles MP : nouvelle colonne "sous_famille" - demande explicite : remplir
-- avec la meme valeur que "categorie" au depart (point de depart modifiable
-- ensuite article par article, comme categorie/gamme/gamme_statistique).

alter table articles_matiere_premiere add column if not exists sous_famille text;

update articles_matiere_premiere
set sous_famille = categorie
where sous_famille is null;
