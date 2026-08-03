-- Date prevue de reception (saisie manuelle) pour un dossier Import MP -
-- affichee et modifiable juste apres le Statut sur la liste Import.
alter table public.dossiers_import_mp_statut
  add column if not exists date_prevue_reception date;
