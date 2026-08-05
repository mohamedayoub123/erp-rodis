-- Chaque clic sur "Fin programme" (ou toute autre action Dashboard) revient
-- sur /production/suivi/dashboard, qui refait sa requete principale sur
-- programme_lignes (deja 6000+ lignes et ca grossit) filtree par
-- confirme_production/programme_termine et triee par date_jour/created_at -
-- sans index correspondant, Postgres doit scanner toute la table a chaque
-- fois. Meme chose pour les 3 tables d'entrees (vrac/carton/emballage),
-- filtrees par programme_ligne_id a chaque chargement du Dashboard.
create index if not exists idx_programme_lignes_dashboard
  on public.programme_lignes (confirme_production, programme_termine, date_jour desc, created_at desc);

create index if not exists idx_production_vrac_entries_ligne
  on public.production_vrac_entries (programme_ligne_id);

create index if not exists idx_production_carton_entries_ligne
  on public.production_carton_entries (programme_ligne_id);

create index if not exists idx_production_emballage_entries_ligne
  on public.production_emballage_entries (programme_ligne_id);

create index if not exists idx_production_rapports_ligne
  on public.production_rapports (programme_ligne_id);
