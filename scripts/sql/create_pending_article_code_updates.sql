-- A coller dans Supabase Dashboard > SQL Editor > New query.
-- Jusqu'ici, le code d'un article (articles.code_manu/code_auto, visible
-- sur "Code par article") se mettait a jour des le Dispatch sur Programme
-- par ligne - avant meme que ce dispatch soit confirme sur Ravitailleur. Si
-- ce dispatch etait ensuite abandonne/refait, le "dernier code" affiche sur
-- l'article restait quand meme avance, ce qui n'est pas voulu.
--
-- Cette table garde le nouveau code de chaque article "en attente" au
-- moment du Dispatch (voir assignDispatcherCodesAndInsert), et n'est
-- appliquee sur articles.code_manu/code_auto qu'au moment ou le Save de
-- Ravitailleur confirme officiellement le programme (voir
-- saveProgrammeDispatcherSnapshotAction / saveAllZonesDispatcherSnapshotAction),
-- qui vide ensuite les lignes consommees.
create table if not exists public.pending_article_code_updates (
  id bigserial primary key,
  groupe_id bigint not null,
  article_id bigint not null references public.articles(id),
  code_manu text,
  code_auto text,
  created_at timestamptz not null default now(),
  unique (groupe_id, article_id)
);

create index if not exists pending_article_code_updates_groupe_id_idx
  on public.pending_article_code_updates (groupe_id);
