-- Pour afficher "Nb PL" (combien de programmes PL<n>.<annee> distincts sont
-- representes dans le Dispatcher d'une zone), il faut pouvoir retrouver de
-- quel groupe programme_lignes vient chaque ligne dispatcher - actuellement
-- rien ne relie les deux tables. Colonne simple (pas de contrainte FK : le
-- groupe_id n'est pas une cle unique sur programme_lignes, c'est une
-- etiquette partagee par plusieurs lignes du meme Save), remplie a partir
-- de maintenant par performProgrammeLigneSave - les lignes deja existantes
-- restent a NULL (pas de moyen fiable de les retrouver retroactivement) et
-- sont ignorees dans le comptage.
alter table public.programme_dispatcher_lignes
  add column if not exists groupe_id bigint;
