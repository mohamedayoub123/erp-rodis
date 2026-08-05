-- Ajoute le suivi "cree par" sur Programme par ligne, meme principe que
-- "utilisateur" sur lots_stock (Mouvements MP/PF) - simple colonne texte
-- remplie avec le username courant a l'enregistrement (performProgrammeLigneSave),
-- affichee dans Historique programme (liste + detail). Les lignes deja
-- existantes restent a NULL (pas de moyen fiable de retrouver retroactivement
-- qui les a saisies).
alter table public.programme_lignes
  add column if not exists cree_par text;
