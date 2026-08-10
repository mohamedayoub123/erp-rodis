-- A coller dans Supabase Dashboard > SQL Editor > New query, PROJET DEV/V2
-- (verifie l'URL du projet en haut de la page Supabase avant de lancer).
--
-- Une seule ligne, cible uniquement la table qui bloque l'Approuver du
-- Transfer Invoice. Le resultat affiche doit etre un GRAND nombre (proche
-- de 40000+) - si c'est un petit nombre (genre 40-50), quelque chose ne va
-- pas et il faut me le dire.
select setval(pg_get_serial_sequence('lots_stock_matiere_premiere', 'id'), (select max(id) from lots_stock_matiere_premiere));
