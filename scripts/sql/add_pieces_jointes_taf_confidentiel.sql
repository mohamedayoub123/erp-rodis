-- Ajoute la colonne pieces_jointes a qualite_taf_confidentiel, meme motif
-- que qualite_nc_confidentiel. Le bucket Storage "qualite-audit-fichiers"
-- existe deja (partage entre NC et TAF) - inutile de le recreer.

alter table qualite_taf_confidentiel
  add column if not exists pieces_jointes jsonb not null default '[]'::jsonb;
