-- A coller dans Supabase Dashboard > SQL Editor > New query.
-- Sauvegarde des lignes de la page "Programe par ligne" (planning de
-- production journalier). Chaque clic sur "Save" insere un lot de lignes
-- qui partagent le meme groupe_id et le meme code programe (ex: MB1, MB2...).
create table if not exists public.programme_lignes (
  id bigserial primary key,
  groupe_id bigint,
  zone text not null,
  chaine text not null,
  article_id bigint references public.articles(id),
  produit text,
  type_article text,
  qt_carton numeric,
  vrac_a_fabriquer numeric,
  plateforme text,
  programe text,
  date_jour date not null default current_date,
  created_at timestamptz not null default now()
);

create index if not exists programme_lignes_groupe_id_idx
  on public.programme_lignes (groupe_id);
