-- A coller dans Supabase Dashboard > SQL Editor > New query.
-- "Programme" (MB1, MB2...) ne creait jusqu'ici AUCUNE ligne dans
-- programme_lignes - or Dashboard Production et Calendrier lisent
-- EXCLUSIVEMENT programme_lignes (confirme_production=true,
-- programme_termine=false/null), jamais programme_dispatcher_lignes ni la
-- table programmes. Resultat : un programme MB confirme (Save sur sa page
-- Dispatch) n'apparaissait jamais sur le Dashboard/Calendrier.
--
-- Ces 2 colonnes permettent au Dispatch de "Programme" (MB) de creer/
-- mettre a jour des lignes miroir dans programme_lignes (exactement comme
-- "Programme par ligne" le fait pour lui-meme), avec un lien stable vers
-- leur programme MB source - necessaire pour retrouver/reutiliser les
-- memes lignes miroir a chaque redispatch au lieu d'en creer de nouvelles a
-- chaque fois.
alter table public.programme_lignes
  add column if not exists source_numero_programme bigint;

alter table public.programme_lignes
  add column if not exists source_programme_id bigint references public.programmes(id);

create index if not exists programme_lignes_source_numero_programme_idx
  on public.programme_lignes (source_numero_programme);
