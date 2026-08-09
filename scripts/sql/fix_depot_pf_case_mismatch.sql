-- A coller dans Supabase Dashboard > SQL Editor > New query.
-- Le depot "A" a ete cree a la main avec le nom "DEPOT A" (majuscules) AVANT
-- que le SQL de backfill (qui cherchait "Depot A", casse differente) ne
-- tourne - la recherche par nom n'a donc rien trouve et a mis depot_id a
-- vide (NULL) pour la quasi-totalite des articles Produit Fini. Corrige ici
-- directement par les vrais id (verifies en base : DEPOT A=1, Depot B=3,
-- Depot E=4), sans dependre du nom.
update public.articles
set depot_id = 1
where nature is distinct from 'vrac';

update public.articles
set depot_id = 3
where nature = 'vrac';

update public.articles_matiere_premiere
set depot_id = 4
where depot_id is null;
