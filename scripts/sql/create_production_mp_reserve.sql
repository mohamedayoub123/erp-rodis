-- A coller dans Supabase Dashboard > SQL Editor > New query.
--
-- Reservation MP au moment du "Valider" (Salle de pesage/conditionnement) :
-- des que je Valide un batch, la quantite besoin de chaque MP est reservee
-- pour LUI - un autre batch qui a besoin de la meme MP dans le meme depot ne
-- doit plus la voir comme disponible, meme si le stock reel n'a pas encore
-- bouge (aucun Transfer Invoice valide). Une ligne par
-- (production_code_termine, article MP).
create table if not exists public.production_mp_reserve (
  id bigserial primary key,
  production_code_termine_id bigint not null references public.production_code_termine(id) on delete cascade,
  article_mp_id bigint not null references public.articles_matiere_premiere(id),
  depot_id bigint not null references public.depots(id),
  quantite numeric not null,
  created_at timestamptz not null default now()
);

create index if not exists production_mp_reserve_article_depot_idx
  on public.production_mp_reserve (article_mp_id, depot_id);
