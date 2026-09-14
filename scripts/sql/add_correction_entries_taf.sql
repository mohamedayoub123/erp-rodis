alter table qualite_taf_confidentiel
  add column if not exists correction_entries jsonb not null default '[]'::jsonb;
