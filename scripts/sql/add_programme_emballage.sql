-- Ajoute la machine et la quantite Emballage sur programmes (3eme etape du
-- pipeline Fabrication -> Conditionnement -> Emballage). Contrairement a
-- qt_carton/qt_vrac, qt_emballage est saisi a la main, pas calcule.
alter table programmes
  add column if not exists machine_emballage_id bigint references machines(id),
  add column if not exists qt_emballage numeric not null default 0;
