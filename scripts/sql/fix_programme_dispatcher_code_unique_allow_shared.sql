-- L'index unique sur "code" seul (add_programme_dispatcher_code_unique.sql)
-- entre en conflit avec une fonctionnalite demandee explicitement par
-- l'utilisateur : quand le vrac combine de 2 chaines pour le meme article
-- depasse le max autorise, le lot excedentaire est reparti sur les 2
-- chaines et DOIT porter le MEME code (ex: 4500 sur chaine 1 + 4500 sur
-- chaine 2, max 3000 -> le "1500" de chaine 1 et le "1500" de chaine 2
-- forment ensemble un 3eme lot de 3000, un seul code partage sur les 2
-- lignes dispatcher). Avec l'index sur "code" seul, ce cas provoquait
-- systematiquement "duplicate key value violates unique constraint" - ce
-- n'etait pas une vraie collision accidentelle, c'etait la fonctionnalite
-- elle-meme qui violait la contrainte a chaque fois.
--
-- Remplace par un index unique compose sur (code, zone, chaine) : autorise
-- le meme code sur 2 chaines differentes (le cas voulu ci-dessus), tout en
-- bloquant toujours un vrai doublon exact (meme code, meme zone, meme
-- chaine), qui resterait une erreur de tracabilite.
drop index if exists public.programme_dispatcher_lignes_code_unique_idx;

create unique index if not exists programme_dispatcher_lignes_code_zone_chaine_unique_idx
  on public.programme_dispatcher_lignes (code, zone, chaine)
  where code is not null;
