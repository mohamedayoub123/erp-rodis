-- A coller dans Supabase Dashboard > SQL Editor > New query (1/3).
-- Plan comptable (structure SYSCOHADA - standard OHADA, applicable au Togo) -
-- Module Comptabilite, Phase 1. 9 comptes seme, extensible ensuite via la
-- page /comptabilite/plan-comptable.
create table if not exists public.comptes_comptables (
  id bigserial primary key,
  code text not null unique,
  libelle text not null,
  classe smallint not null,
  created_at timestamptz not null default now()
);

insert into public.comptes_comptables (code, libelle, classe) values
  ('601000', 'Achats de matieres premieres', 6),
  ('401000', 'Fournisseurs', 4),
  ('321000', 'Stock de matieres premieres', 3),
  ('603100', 'Variation de stock de matieres premieres', 6),
  ('331000', 'En-cours de production de biens', 3),
  ('361000', 'Stock de produits finis', 3),
  ('713600', 'Variation de stock de produits finis', 7),
  ('411000', 'Clients', 4),
  ('701000', 'Ventes de produits finis', 7)
on conflict (code) do nothing;
