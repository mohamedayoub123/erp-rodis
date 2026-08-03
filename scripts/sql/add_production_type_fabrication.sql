-- Type de fabrication (Automatique/Semi auto/Gel douche/Parfume/Huile-Serum/
-- Savon/Talc) - champ libre a choix dans une liste fixe, propre a l'etape
-- Fabrication.
alter table public.production_rapports
  add column if not exists type_fabrication text;
