-- V2 uniquement. J'avais oublie ce bout de add_production_code_columns.sql
-- dans le fix precedent : l'ancienne contrainte (un seul rapport par ligne)
-- bloque la copie des vraies donnees V1, qui ont legitimement plusieurs
-- rapports par ligne (un par code, depuis que Fabrication decoupe une
-- ligne en plusieurs lots).
alter table public.production_rapports drop constraint if exists production_rapports_ligne_unique;
alter table public.production_rapports
  add constraint production_rapports_ligne_code_unique unique (programme_ligne_id, code);
