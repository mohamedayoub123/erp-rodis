-- Remarque (texte libre) et Statut (En attente / Partiellement fini / Fini)
-- sur la table programmes. Comme date_jour et numero_programme, ces deux
-- champs sont partages par toutes les lignes d'un meme numero_programme
-- (meme "MB") - les modifier met a jour toutes les lignes du groupe.
ALTER TABLE programmes
  ADD COLUMN IF NOT EXISTS remarque text,
  ADD COLUMN IF NOT EXISTS statut text NOT NULL DEFAULT 'En attente';
