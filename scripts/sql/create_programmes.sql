-- Nouvelle page "Programme" (separee de Programme par ligne existant) :
-- article fini + machine Fabrication + machine Conditionnement + qt carton
-- + qt vrac, avec qt carton/vrac calcules automatiquement a partir de la
-- capacite des machines (table machine_produits deja existante) et
-- modifiables a la main.
create table if not exists programmes (
  id bigint generated always as identity primary key,
  article_id bigint not null references articles(id),
  vrac_article_id bigint references articles(id),
  machine_fabrication_id bigint references machines(id),
  machine_conditionnement_id bigint references machines(id),
  duree_minutes numeric,
  qt_carton numeric not null default 0,
  qt_vrac numeric not null default 0,
  date_jour date not null default current_date,
  utilisateur text,
  created_at timestamptz not null default now()
);

create index if not exists programmes_date_jour_idx on programmes(date_jour);
create index if not exists programmes_article_id_idx on programmes(article_id);
