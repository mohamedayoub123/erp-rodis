-- A coller dans Supabase Dashboard > SQL Editor > New query.
-- Historique des snapshots pris depuis "Programme Dispatcher <ZONE>" (bouton
-- Save) - chaque clic copie l'etat courant de programme_dispatcher_lignes
-- pour cette zone dans un nouveau lot (groupe_id), affiche/numerote PD1,
-- PD2, PD3... a la lecture (meme principe que MB1/MB2 et TE1/TS1).
create table if not exists public.programme_dispatcher_history (
  id bigserial primary key,
  groupe_id bigint,
  zone text not null,
  article_id bigint references public.articles(id),
  chaine text,
  produit text,
  code text,
  qt_carton numeric,
  qt_vrac numeric,
  date_jour date not null default current_date,
  created_at timestamptz not null default now()
);

create index if not exists programme_dispatcher_history_groupe_id_idx
  on public.programme_dispatcher_history (groupe_id);
