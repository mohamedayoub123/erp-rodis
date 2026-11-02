-- A coller dans Supabase Dashboard > SQL Editor > New query.
-- Statistique Article Plastique (E3) : UN ARTICLE PEUT TRAVAILLER SUR PLUSIEURS MACHINES EN MEME TEMPS (3 ou plus), et chaque
-- machine a SES PROPRES cavites. Avant : une seule machine et un seul nombre de cavites par article (colonnes machine_plastique et
-- nb_cavites de articles_matiere_premiere, qui ne sont plus utilisees quand cette table existe).
-- Les machines viennent de la liste Production Plastique > Equipements (table equipements_plastique).
--
-- Idempotent (peut etre relance sans risque). Aucune donnee existante modifiee : la machine unique deja saisie, avec ses cavites,
-- est simplement reprise comme premiere ligne de l'article.
create table if not exists public.article_machines_plastique (
  article_id bigint not null references public.articles_matiere_premiere(id) on delete cascade,
  equipement_id bigint not null references public.equipements_plastique(id),
  nb_cavites integer,
  created_at timestamptz not null default now(),
  primary key (article_id, equipement_id)
);

create index if not exists article_machines_plastique_equipement_idx
  on public.article_machines_plastique (equipement_id);

insert into public.article_machines_plastique (article_id, equipement_id, nb_cavites)
select a.id, e.id, a.nb_cavites
from public.articles_matiere_premiere a
join public.equipements_plastique e on e.nom = btrim(a.machine_plastique)
where a.machine_plastique is not null and btrim(a.machine_plastique) <> ''
on conflict (article_id, equipement_id) do nothing;
