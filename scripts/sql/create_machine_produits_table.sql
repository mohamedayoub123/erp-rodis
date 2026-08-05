create table if not exists public.machine_produits (
  id bigint generated always as identity primary key,
  machine_id bigint not null references public.machines(id) on delete cascade,
  article_id bigint not null references public.articles(id),
  temps_minutes numeric,
  created_at timestamptz not null default now(),
  unique (machine_id, article_id)
);
