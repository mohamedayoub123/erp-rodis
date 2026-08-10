-- A coller dans Supabase Dashboard > SQL Editor > New query, PROJET DEV/V2.
--
-- Ajoute le statut qualite decide au Test labo (Conforme / A recuperer /
-- A detruire) sur production_rapports, et une table d'historique pour
-- tracer les codes dont la fabrication a ete detruite (jamais credite au
-- stock reel).
alter table public.production_rapports
  add column if not exists disposition_qualite text;

create table if not exists public.production_destruction_history (
  id bigint generated always as identity primary key,
  programme_ligne_id bigint not null references public.programme_lignes(id),
  code text not null,
  article_vrac_id bigint,
  quantite numeric not null,
  utilisateur text,
  date_destruction timestamptz not null default now()
);

create index if not exists production_destruction_history_ligne_idx
  on public.production_destruction_history (programme_ligne_id);

-- Verification
select column_name from information_schema.columns
where table_schema = 'public' and table_name = 'production_rapports' and column_name = 'disposition_qualite';

select * from public.production_destruction_history limit 1;
