-- Journal des entrees vrac datees (meme principe que production_carton_entries) :
-- le "Qt fabriquer" et le nouveau "Vrac fabriquer" du Rapport Production
-- alimentent maintenant ce journal, pour que le reste (prevu - somme des
-- entrees) se calcule automatiquement sur le Dashboard.
create table if not exists public.production_vrac_entries (
  id bigint generated always as identity primary key,
  programme_ligne_id bigint not null references public.programme_lignes(id) on delete cascade,
  quantite numeric not null,
  date_jour date not null default current_date,
  created_at timestamptz not null default now()
);

create index if not exists production_vrac_entries_ligne_idx
  on public.production_vrac_entries (programme_ligne_id);

-- Le rapport garde aussi une trace du vrac fabrique saisi ce jour-la.
alter table public.production_rapports
  add column if not exists vrac_fabrique numeric;
