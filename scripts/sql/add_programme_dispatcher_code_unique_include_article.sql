-- L'index unique sur (code, zone, chaine) forcait 2 contenances DIFFERENTES
-- de la meme famille (ex: 750ml + 400ml) partageant le meme code et tombant
-- sur la meme chaine a etre fusionnees en une seule ligne Dispatcher (voir
-- app/programe-par-ligne/actions.ts) - leurs Qt Carton (calculees chacune
-- avec leur propre nombre de pieces par carton) etaient additionnees et
-- leurs noms concatenes avec "+", ce qui donne un total de cartons
-- inexploitable pour l'emballage (2 contenances differentes ne se
-- conditionnent pas dans le meme type de carton).
--
-- Remplace par un index unique compose sur (code, zone, chaine, article_id) :
-- autorise 2 contenances differentes (article_id different) a coexister sur
-- (code, zone, chaine), tout en bloquant toujours un vrai doublon exact
-- (meme code, meme zone, meme chaine, meme article), qui resterait une
-- erreur de tracabilite.
drop index if exists public.programme_dispatcher_lignes_code_zone_chaine_unique_idx;

create unique index if not exists programme_dispatcher_lignes_code_zone_chaine_article_unique_idx
  on public.programme_dispatcher_lignes (code, zone, chaine, article_id)
  where code is not null;
