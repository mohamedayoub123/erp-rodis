-- Une ligne "Programme par ligne" decoupee en plusieurs lots (voir
-- buildDispatcherDraftRows) donnait plusieurs codes (ex: 9000 -> 3x3000)
-- MAIS un seul rapport de production par ligne (production_rapports.
-- programme_ligne_id unique) - Conditionnement/Emballage saisis pour UN
-- code s'appliquaient donc a tort aux 2 autres codes de la meme ligne
-- (meme rapport partage, mêmes journaux carton/emballage), y compris le
-- passage automatique a l'etape suivante (Emballage) qui se declenchait
-- pour les 3 codes au lieu d'un seul.
--
-- Ajoute une colonne "code" (defaut '' = comportement historique/partage,
-- utilise tel quel par Fabrication qui reste au niveau de la ligne
-- entiere - le vrac est fabrique en un seul bloc avant d'etre reparti en
-- lots). Conditionnement/Emballage utilisent desormais le vrai code du
-- lot, jamais '' pour une nouvelle saisie.
alter table public.production_rapports add column if not exists code text not null default '';
alter table public.production_carton_entries add column if not exists code text not null default '';
alter table public.production_vrac_entries add column if not exists code text not null default '';
alter table public.production_emballage_entries add column if not exists code text not null default '';

alter table public.production_rapports drop constraint if exists production_rapports_ligne_unique;
alter table public.production_rapports
  add constraint production_rapports_ligne_code_unique unique (programme_ligne_id, code);
