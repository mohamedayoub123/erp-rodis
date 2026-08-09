-- A coller dans Supabase Dashboard > SQL Editor > New query.
-- Change d'approche pour les Depots : au lieu d'une saisie manuelle
-- (depot_mouvements), le depot devient un champ direct sur chaque article -
-- modifiable depuis "Articles Produit Fini"/"Articles Matiere Premiere",
-- rempli automatiquement ici pour tous les articles existants :
--   - Produit fini (nature != 'vrac') -> Depot A
--   - Vrac (nature = 'vrac')          -> Depot B
--   - Matiere premiere (MP)           -> Depot E
-- La page /depots/[id] affichera alors le stock REEL (lots_stock /
-- lots_stock_matiere_premiere) de tous les articles rattaches a ce depot,
-- sans plus jamais avoir besoin d'ajouter quoi que ce soit a la main.

-- Cree les 3 depots seulement s'ils n'existent pas deja (au cas ou l'un
-- d'eux a deja ete cree a la main depuis la page /depots).
insert into public.depots (nom)
select 'Depot A' where not exists (select 1 from public.depots where nom = 'Depot A');
insert into public.depots (nom)
select 'Depot B' where not exists (select 1 from public.depots where nom = 'Depot B');
insert into public.depots (nom)
select 'Depot E' where not exists (select 1 from public.depots where nom = 'Depot E');

alter table public.articles
  add column if not exists depot_id bigint references public.depots(id);

alter table public.articles_matiere_premiere
  add column if not exists depot_id bigint references public.depots(id);

update public.articles
set depot_id = (select id from public.depots where nom = 'Depot B')
where nature = 'vrac' and depot_id is null;

update public.articles
set depot_id = (select id from public.depots where nom = 'Depot A')
where (nature is distinct from 'vrac') and depot_id is null;

update public.articles_matiere_premiere
set depot_id = (select id from public.depots where nom = 'Depot E')
where depot_id is null;

-- depot_mouvements (saisie manuelle, jamais utilisee) n'est plus necessaire
-- avec cette approche.
drop table if exists public.depot_mouvements;
