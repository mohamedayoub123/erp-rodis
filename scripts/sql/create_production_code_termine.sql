-- A coller dans Supabase Dashboard > SQL Editor > New query.
-- "Fin programme" (Terminer) sur le Dashboard etait au niveau de la ligne
-- entiere (programme_lignes.vrac_termine/carton_termine/emballage_termine)
-- - sur une ligne decoupee en plusieurs codes (numero_lot = "AA1, AA2,
-- AA3"), Terminer UN SEUL code cachait donc a tort les 2 autres du
-- Dashboard (meme bug de fond que le suivi par code des rapports,
-- corrige plus tot). Cette table garde desormais quel(s) code(s) precis
-- ont ete termines, etape par etape.
create table if not exists public.production_code_termine (
  id bigserial primary key,
  programme_ligne_id bigint not null references public.programme_lignes(id),
  code text not null,
  stage text not null check (stage in ('vrac', 'carton', 'emballage')),
  termine_date timestamptz not null default now(),
  unique (programme_ligne_id, code, stage)
);

create index if not exists production_code_termine_ligne_idx
  on public.production_code_termine (programme_ligne_id);
