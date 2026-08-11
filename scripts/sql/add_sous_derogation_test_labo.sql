-- A coller dans Supabase Dashboard > SQL Editor > New query, PROJET DEV/V2.
--
-- Permet de valider un Test labo "sous derogation" quand un parametre est
-- hors spec, avec le motif trace pour rester consultable.
alter table public.production_rapports
  add column if not exists sous_derogation boolean not null default false;

alter table public.production_rapports
  add column if not exists motif_derogation text;

-- Verification
select column_name from information_schema.columns
where table_schema = 'public' and table_name = 'production_rapports'
  and column_name in ('sous_derogation', 'motif_derogation');
