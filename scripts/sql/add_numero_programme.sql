-- Ajoute un numero de programme sequentiel (MB1, MB2, MB3...) sur la table
-- programmes. Un seul numero par enregistrement (toutes les lignes/articles
-- d'un meme programme, crees dans le meme formulaire, partagent le meme
-- numero) - affiche cote app comme "MB" + numero_programme.
ALTER TABLE programmes
  ADD COLUMN IF NOT EXISTS numero_programme integer;
