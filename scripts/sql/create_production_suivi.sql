-- Suivi Production : suivi de l'avancement reel par rapport a ce qui a ete
-- planifie dans "Programme par ligne" (programme_lignes).

-- Vrac : simple etat "termine" + date (pas de journal, un seul evenement).
alter table public.programme_lignes
  add column if not exists vrac_termine boolean not null default false,
  add column if not exists vrac_termine_date date;

-- Carton : journal d'entrees datees (peut depasser la quantite prevue - le
-- total produit est juste la somme de toutes les entrees).
create table if not exists public.production_carton_entries (
  id bigint generated always as identity primary key,
  programme_ligne_id bigint not null references public.programme_lignes(id) on delete cascade,
  quantite numeric not null,
  date_jour date not null default current_date,
  created_at timestamptz not null default now()
);

create index if not exists production_carton_entries_ligne_idx
  on public.production_carton_entries (programme_ligne_id);
