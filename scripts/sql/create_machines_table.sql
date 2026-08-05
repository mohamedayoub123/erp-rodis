create table if not exists public.machines (
  id bigint generated always as identity primary key,
  nom text not null,
  zone text,
  type text,
  capacite numeric,
  capacite_min numeric,
  capacite_max numeric,
  created_at timestamptz not null default now()
);
