-- A coller dans Supabase Dashboard > SQL Editor > New query.
-- Prix de vente special par (article, client) - un article peut avoir 0, 1
-- ou plusieurs clients avec un prix different du prix de vente standard
-- (articles.prix_vente). Une seule ligne par couple article/client (le "+"
-- cote client ajoute une ligne, jamais un doublon - re-saisir un prix pour
-- le meme client met a jour la ligne existante).
create table if not exists public.prix_vente_speciaux (
  id bigint generated always as identity primary key,
  article_id bigint not null references public.articles(id) on delete cascade,
  client_id bigint not null references public.clients(id) on delete cascade,
  prix numeric not null,
  created_at timestamptz not null default now(),
  unique (article_id, client_id)
);

create index if not exists prix_vente_speciaux_article_idx
  on public.prix_vente_speciaux (article_id);
