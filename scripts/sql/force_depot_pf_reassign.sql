-- A coller dans Supabase Dashboard > SQL Editor > New query.
-- Reapplique la regle Depot A/Depot B a TOUS les articles Produit Fini
-- (pas seulement ceux dont depot_id etait encore vide) - au cas ou certains
-- articles avaient deja un depot_id pose avant la regle automatique et
-- n'auraient donc pas ete touches par le 1er backfill.
update public.articles
set depot_id = (select id from public.depots where nom = 'Depot B')
where nature = 'vrac';

update public.articles
set depot_id = (select id from public.depots where nom = 'Depot A')
where nature is distinct from 'vrac';
