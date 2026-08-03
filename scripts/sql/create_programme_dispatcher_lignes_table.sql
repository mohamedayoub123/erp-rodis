-- A coller dans Supabase Dashboard > SQL Editor > New query.
-- Recoit une copie (chaine, produit, qt_carton, qt_vrac) de chaque ligne
-- enregistree depuis "Programme par ligne", routee vers la bonne zone
-- (B1Z1, B1Z2, B4Z1, B4Z2, B4Z3, D) - affichee sur les pages
-- "Programme Dispatcher <ZONE>".
create table if not exists public.programme_dispatcher_lignes (
  id bigserial primary key,
  zone text not null,
  article_id bigint references public.articles(id),
  chaine text,
  produit text,
  code text,
  qt_carton numeric,
  qt_vrac numeric,
  flacon_pot text,
  capsule_pompe text,
  sleeve text,
  carton text,
  etiquete text,
  nb_etuit text,
  dispenseur text,
  date_jour date not null default current_date,
  created_at timestamptz not null default now()
);

create index if not exists programme_dispatcher_lignes_zone_idx
  on public.programme_dispatcher_lignes (zone);
