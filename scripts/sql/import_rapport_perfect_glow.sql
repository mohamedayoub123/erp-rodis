-- Import du rapport PERFECT GLOW (onboarding multi-gammes Statistique MP).
-- 38 articles.
-- A executer dans Supabase SQL Editor (la table existe deja, creee pour MP COSM).

insert into public.rapport_gamme_statistique_mp
  (gamme_statistique, ordre, designation, categorie, donnees)
values
  ('PERFECT GLOW', 38, 'COLORANT ORANGE AOR7 / CI 15510', null, '{"2025":45000,"unite":null,"avis":null,"statistique 4D 6 mois":null,"statistique 4D 6 mois calculée":null,"utilisation":"huile bb clear vitamine-c\nserum bb clear vitamine-c\ngel douche perfect glow\ngel douche bb clear vitamine-c\ngel douche soopure carrot\nsavon white secret\nsavon perfect glow\nsavon bb clear vitamine-c"}'::jsonb),
  ('PERFECT GLOW', 1, 'BASE ME42624 SWEET GLITTERING', null, '{"2025":11500,"unite":"ME\nCP","avis":null,"statistique 4D 6 mois":null,"statistique 4D 6 mois calculée":null,"utilisation":null}'::jsonb),
  ('PERFECT GLOW', 2, 'BASE ME46043 GLITTERING SOAP', null, '{"2025":750,"unite":"ME\nCP","avis":null,"statistique 4D 6 mois":null,"statistique 4D 6 mois calculée":null,"utilisation":null}'::jsonb),
  ('PERFECT GLOW', 3, 'CARTON CREME PERFECT GLOW 140ML', null, '{"2025":3200,"unite":"6dz","avis":null,"statistique 4D 6 mois":null,"statistique 4D 6 mois calculée":null,"utilisation":null}'::jsonb),
  ('PERFECT GLOW', 4, 'CARTON CREME PERFECT GLOW 320 ML', null, '{"2025":4050,"unite":"3dz","avis":null,"statistique 4D 6 mois":null,"statistique 4D 6 mois calculée":null,"utilisation":null}'::jsonb),
  ('PERFECT GLOW', 5, 'CARTON DSR PERFECT GLOW 30 ML', null, '{"2025":2200,"unite":"6dz","avis":null,"statistique 4D 6 mois":null,"statistique 4D 6 mois calculée":null,"utilisation":null}'::jsonb),
  ('PERFECT GLOW', 6, 'CARTON GEL DOUCHE PERFECT GLOW 1L', null, '{"2025":8300,"unite":"1dz","avis":null,"statistique 4D 6 mois":null,"statistique 4D 6 mois calculée":null,"utilisation":null}'::jsonb),
  ('PERFECT GLOW', 7, 'CARTON GEL DOUCHE PERFECT GLOW 500ML', null, '{"2025":4500,"unite":"2dz","avis":null,"statistique 4D 6 mois":null,"statistique 4D 6 mois calculée":null,"utilisation":null}'::jsonb),
  ('PERFECT GLOW', 8, 'CARTON GEL DOUCHE PERFECT GLOW EXFL. 500ML', null, '{"2025":410,"unite":"2dz","avis":null,"statistique 4D 6 mois":null,"statistique 4D 6 mois calculée":null,"utilisation":null}'::jsonb),
  ('PERFECT GLOW', 9, 'CARTON HUILE PERFECT GLOW 60ML', null, '{"2025":"520 + 250 N","unite":"8dz","avis":null,"statistique 4D 6 mois":null,"statistique 4D 6 mois calculée":null,"utilisation":null}'::jsonb),
  ('PERFECT GLOW', 10, 'CARTON LAIT PERFECT GLOW 200 ML', null, '{"2025":35500,"unite":"4dz","avis":null,"statistique 4D 6 mois":null,"statistique 4D 6 mois calculée":null,"utilisation":null}'::jsonb),
  ('PERFECT GLOW', 11, 'CARTON LAIT PERFECT GLOW 300ML', null, '{"2025":33000,"unite":"3dz","avis":null,"statistique 4D 6 mois":null,"statistique 4D 6 mois calculée":null,"utilisation":null}'::jsonb),
  ('PERFECT GLOW', 12, 'CARTON LAIT PERFECT GLOW 500 ML', null, '{"2025":22000,"unite":"2dz","avis":null,"statistique 4D 6 mois":null,"statistique 4D 6 mois calculée":null,"utilisation":null}'::jsonb),
  ('PERFECT GLOW', 13, 'CARTON SAVON PERFECT GLOW 190GR', null, '{"2025":"2700 + 400 EXFO","unite":"4dz","avis":null,"statistique 4D 6 mois":null,"statistique 4D 6 mois calculée":null,"utilisation":null}'::jsonb),
  ('PERFECT GLOW', 14, 'CARTON SAVON PERFECT GLOW 90 GR', null, '{"2025":0,"unite":"8dz","avis":null,"statistique 4D 6 mois":null,"statistique 4D 6 mois calculée":null,"utilisation":null}'::jsonb),
  ('PERFECT GLOW', 15, 'CARTON SERUM PERFECT GLOW 30ML', null, '{"2025":"650 + 10 N","unite":"6dz","avis":null,"statistique 4D 6 mois":null,"statistique 4D 6 mois calculée":null,"utilisation":null}'::jsonb),
  ('PERFECT GLOW', 16, 'CARTON TUBE CREME PERFECT GLOW 70GR', null, '{"2025":410,"unite":"6dz","avis":null,"statistique 4D 6 mois":null,"statistique 4D 6 mois calculée":null,"utilisation":null}'::jsonb),
  ('PERFECT GLOW', 17, 'ETIQUETTE GEL DOUCHE PERFECT GLOW CARROT 1L 17*6,7CM', null, '{"2025":null,"unite":null,"avis":null,"statistique 4D 6 mois":null,"statistique 4D 6 mois calculée":null,"utilisation":null}'::jsonb),
  ('PERFECT GLOW', 18, 'ETIQUETTE GEL DOUCHE PERFECT GLOW CARROT 500ML', null, '{"2025":null,"unite":null,"avis":null,"statistique 4D 6 mois":null,"statistique 4D 6 mois calculée":null,"utilisation":null}'::jsonb),
  ('PERFECT GLOW', 19, 'ETIQUETTE GEL DOUCHE PERFECT GLOW CARROT EXFL. 500ML', null, '{"2025":null,"unite":null,"avis":null,"statistique 4D 6 mois":null,"statistique 4D 6 mois calculée":null,"utilisation":null}'::jsonb),
  ('PERFECT GLOW', 20, 'ETIQUETTES SERUM PERFECT GLOW 30ML', null, '{"2025":null,"unite":null,"avis":null,"statistique 4D 6 mois":null,"statistique 4D 6 mois calculée":null,"utilisation":null}'::jsonb),
  ('PERFECT GLOW', 21, 'ETUIS DSR PERFECT GLOW 30ML', null, '{"2025":null,"unite":null,"avis":null,"statistique 4D 6 mois":null,"statistique 4D 6 mois calculée":null,"utilisation":null}'::jsonb),
  ('PERFECT GLOW', 22, 'ETUIS PERFECT GLOW DSR DISPENSER 12*30ML', null, '{"2025":null,"unite":null,"avis":null,"statistique 4D 6 mois":null,"statistique 4D 6 mois calculée":null,"utilisation":null}'::jsonb),
  ('PERFECT GLOW', 23, 'ETUIS SAVON PERFECT GLOW 190 GR', null, '{"2025":null,"unite":null,"avis":null,"statistique 4D 6 mois":null,"statistique 4D 6 mois calculée":null,"utilisation":null}'::jsonb),
  ('PERFECT GLOW', 24, 'ETUIS SAVON PERFECT GLOW 90GR', null, '{"2025":null,"unite":null,"avis":null,"statistique 4D 6 mois":null,"statistique 4D 6 mois calculée":null,"utilisation":null}'::jsonb),
  ('PERFECT GLOW', 25, 'ETUIS SAVON PERFECT GLOW EXFOLIANT 190GR', null, '{"2025":null,"unite":null,"avis":null,"statistique 4D 6 mois":null,"statistique 4D 6 mois calculée":null,"utilisation":null}'::jsonb),
  ('PERFECT GLOW', 26, 'ETUIS SERUM PERFECT GLOW 30ML', null, '{"2025":null,"unite":null,"avis":null,"statistique 4D 6 mois":null,"statistique 4D 6 mois calculée":null,"utilisation":null}'::jsonb),
  ('PERFECT GLOW', 27, 'ETUIS TUBE CREME PERFECT GLOW 70GR', null, '{"2025":null,"unite":null,"avis":null,"statistique 4D 6 mois":null,"statistique 4D 6 mois calculée":null,"utilisation":null}'::jsonb),
  ('PERFECT GLOW', 28, 'SLEEVE CREME PERFECT GLOW 140ML', null, '{"2025":null,"unite":null,"avis":null,"statistique 4D 6 mois":null,"statistique 4D 6 mois calculée":null,"utilisation":null}'::jsonb),
  ('PERFECT GLOW', 29, 'SLEEVE CREME PERFECT GLOW 320ML', null, '{"2025":null,"unite":null,"avis":null,"statistique 4D 6 mois":null,"statistique 4D 6 mois calculée":null,"utilisation":null}'::jsonb),
  ('PERFECT GLOW', 30, 'SLEEVE DSR PERFECT GLOW 30ML', null, '{"2025":null,"unite":null,"avis":null,"statistique 4D 6 mois":null,"statistique 4D 6 mois calculée":null,"utilisation":null}'::jsonb),
  ('PERFECT GLOW', 31, 'SLEEVE HUIL PERFECT GLOW 60ML', null, '{"2025":null,"unite":null,"avis":null,"statistique 4D 6 mois":null,"statistique 4D 6 mois calculée":null,"utilisation":null}'::jsonb),
  ('PERFECT GLOW', 32, 'SLEEVE LAIT PERFECT GLOW 200ML', null, '{"2025":null,"unite":null,"avis":null,"statistique 4D 6 mois":null,"statistique 4D 6 mois calculée":null,"utilisation":null}'::jsonb),
  ('PERFECT GLOW', 33, 'SLEEVE LAIT PERFECT GLOW 300ML', null, '{"2025":null,"unite":null,"avis":null,"statistique 4D 6 mois":null,"statistique 4D 6 mois calculée":null,"utilisation":null}'::jsonb),
  ('PERFECT GLOW', 34, 'SLEEVE LAIT PERFECT GLOW 500ML', null, '{"2025":null,"unite":null,"avis":null,"statistique 4D 6 mois":null,"statistique 4D 6 mois calculée":null,"utilisation":null}'::jsonb),
  ('PERFECT GLOW', 35, 'TUBE VIDE CREME PERFECT GLOW 70GR', null, '{"2025":null,"unite":null,"avis":null,"statistique 4D 6 mois":null,"statistique 4D 6 mois calculée":null,"utilisation":null}'::jsonb),
  ('PERFECT GLOW', 36, '28/410 SCREW LOTION PUMP TRANS ORANGE PANT 1505C-252MM', null, '{"2025":null,"unite":null,"avis":null,"statistique 4D 6 mois":null,"statistique 4D 6 mois calculée":null,"utilisation":null}'::jsonb),
  ('PERFECT GLOW', 37, '28/410 SCREW LOTION PUMP ORANGE PANT 1505C-203MM', null, '{"2025":null,"unite":null,"avis":null,"statistique 4D 6 mois":null,"statistique 4D 6 mois calculée":null,"utilisation":null}'::jsonb)
on conflict (gamme_statistique, ordre) do update set
  designation = excluded.designation,
  categorie = excluded.categorie,
  donnees = excluded.donnees;
