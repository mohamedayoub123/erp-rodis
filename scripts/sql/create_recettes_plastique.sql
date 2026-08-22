-- A coller dans Supabase Dashboard > SQL Editor > New query.
-- Recette Plastique : composition en % de chaque article plastique fabrique
-- en interne (flacon/capsule/pot...) - matiere plastique + colorant, chacun
-- avec un pourcentage. Contrairement a recettes_pf (article PF -> article
-- MP), ici les DEUX cotes sont dans articles_matiere_premiere : le produit
-- fini plastique (flacon...) est lui-meme un article MP (consomme ensuite
-- par le Conditionnement cosmetique), et sa "matiere" (resine, colorant)
-- aussi.
create table if not exists public.recettes_plastique (
  id bigserial primary key,
  article_produit_id bigint not null references public.articles_matiere_premiere(id) on delete cascade,
  article_matiere_id bigint not null references public.articles_matiere_premiere(id) on delete cascade,
  pourcentage numeric not null,
  created_at timestamptz not null default now(),
  unique (article_produit_id, article_matiere_id)
);

create index if not exists idx_recettes_plastique_produit
  on public.recettes_plastique (article_produit_id);
