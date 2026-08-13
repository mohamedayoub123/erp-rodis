-- Import du rapport PRECIOUS PERFECT (onboarding multi-gammes Statistique MP).
-- 36 articles.
-- A executer dans Supabase SQL Editor (la table existe deja, creee pour MP COSM).

insert into public.rapport_gamme_statistique_mp
  (gamme_statistique, ordre, designation, categorie, donnees)
values
  ('PRECIOUS PERFECT', 1, 'BASE BAM 60143 - SAV P PER', null, '{"2025":50,"unite":"NP","avis":null,"statistique 4D 6mois":null,"statistique 4D 6mois calculée":null}'::jsonb),
  ('PRECIOUS PERFECT', 2, 'BASE COS 30269 - P PER', null, '{"2025":11500,"unite":"NP","avis":null,"statistique 4D 6mois":null,"statistique 4D 6mois calculée":null}'::jsonb),
  ('PRECIOUS PERFECT', 3, 'BASE AROMA FRUITS 701791', null, '{"2025":350,"unite":"LUZI","avis":null,"statistique 4D 6mois":null,"statistique 4D 6mois calculée":null}'::jsonb),
  ('PRECIOUS PERFECT', 4, 'CARTON CREME PRECIOUS PERFECT 500 (NOUVEAU)', null, '{"2025":3800,"unite":"2dz","avis":null,"statistique 4D 6mois":null,"statistique 4D 6mois calculée":null}'::jsonb),
  ('PRECIOUS PERFECT', 5, 'CARTON CREME PRECIOUS PERFECT RGL 125 (NOUVEAU)', null, '{"2025":3400,"unite":"8dz","avis":null,"statistique 4D 6mois":null,"statistique 4D 6mois calculée":null}'::jsonb),
  ('PRECIOUS PERFECT', 6, 'CARTON CREME PRECIOUS PERFECT STD 250 (NOUVEAU)', null, '{"2025":12000,"unite":"4dz","avis":null,"statistique 4D 6mois":null,"statistique 4D 6mois calculée":null}'::jsonb),
  ('PRECIOUS PERFECT', 7, 'CARTON DSR PRECIOUS PERFECT', null, '{"2025":115,"unite":"6dz","avis":null,"statistique 4D 6mois":null,"statistique 4D 6mois calculée":null}'::jsonb),
  ('PRECIOUS PERFECT', 8, 'CARTON GEL DOUCHE PRECIOUS PERFECT EXF & CLAR 500ML', null, '{"2025":"4000EXFO + 350 CLAR","unite":"2dz","avis":null,"statistique 4D 6mois":null,"statistique 4D 6mois calculée":null}'::jsonb),
  ('PRECIOUS PERFECT', 9, 'CARTON HUILE PRECIOUS PERFECT 125ML', null, '{"2025":"420 + 50 N","unite":"4dz","avis":null,"statistique 4D 6mois":null,"statistique 4D 6mois calculée":null}'::jsonb),
  ('PRECIOUS PERFECT', 10, 'CARTON LAIT PRECIOUS PERFECT 125ML', null, '{"2025":39000,"unite":"4dz","avis":null,"statistique 4D 6mois":null,"statistique 4D 6mois calculée":null}'::jsonb),
  ('PRECIOUS PERFECT', 11, 'CARTON LAIT PRECIOUS PERFECT 250ML', null, '{"2025":53500,"unite":"3dz","avis":null,"statistique 4D 6mois":null,"statistique 4D 6mois calculée":null}'::jsonb),
  ('PRECIOUS PERFECT', 12, 'CARTON LAIT PRECIOUS PERFECT 500ML', null, '{"2025":15000,"unite":"2dz","avis":null,"statistique 4D 6mois":null,"statistique 4D 6mois calculée":null}'::jsonb),
  ('PRECIOUS PERFECT', 13, 'CARTON SAVON PRECIOUS PERFECT', null, '{"2025":1850,"unite":"4dz","avis":null,"statistique 4D 6mois":null,"statistique 4D 6mois calculée":null}'::jsonb),
  ('PRECIOUS PERFECT', 14, 'CARTON SERUM PRECIOUS PERFECT', null, '{"2025":"165 + 25 N","unite":"4dz","avis":null,"statistique 4D 6mois":null,"statistique 4D 6mois calculée":null}'::jsonb),
  ('PRECIOUS PERFECT', 15, 'CARTON TUBE CREME PRECIOUS PERFECT 70 GR', null, '{"2025":228,"unite":"6dz","avis":null,"statistique 4D 6mois":null,"statistique 4D 6mois calculée":null}'::jsonb),
  ('PRECIOUS PERFECT', 16, 'ETIQUETTE GEL DOUCHE PRECIOUS PERFECT 500ML BACK 5,35*13', null, '{"2025":null,"unite":null,"avis":null,"statistique 4D 6mois":null,"statistique 4D 6mois calculée":null}'::jsonb),
  ('PRECIOUS PERFECT', 17, 'ETIQUETTE GEL DOUCHE PRECIOUS PERFECT 500ML FRONT  7*19,5', null, '{"2025":null,"unite":null,"avis":null,"statistique 4D 6mois":null,"statistique 4D 6mois calculée":null}'::jsonb),
  ('PRECIOUS PERFECT', 18, 'ETIQUETTE GEL DOUCHE PRECIOUS PERFECT BACK EXFL 500ML', null, '{"2025":null,"unite":null,"avis":null,"statistique 4D 6mois":null,"statistique 4D 6mois calculée":null}'::jsonb),
  ('PRECIOUS PERFECT', 19, 'ETIQUETTE GEL DOUCHE PRECIOUS PERFECT FRONT EXFL 500ML', null, '{"2025":null,"unite":null,"avis":null,"statistique 4D 6mois":null,"statistique 4D 6mois calculée":null}'::jsonb),
  ('PRECIOUS PERFECT', 20, 'ETIQUETTE PRECIOUS PERFECT CREAM CORRECTOR NIGHT', null, '{"2025":null,"unite":null,"avis":null,"statistique 4D 6mois":null,"statistique 4D 6mois calculée":null}'::jsonb),
  ('PRECIOUS PERFECT', 21, 'ETIQUETTE PRECIOUS PERFECT CREAM CORRECTOR SFP 50 DAY', null, '{"2025":null,"unite":null,"avis":null,"statistique 4D 6mois":null,"statistique 4D 6mois calculée":null}'::jsonb),
  ('PRECIOUS PERFECT', 22, 'ETIQUETTE SERUM PRECIOUS PERFECT 30ML', null, '{"2025":null,"unite":null,"avis":null,"statistique 4D 6mois":null,"statistique 4D 6mois calculée":null}'::jsonb),
  ('PRECIOUS PERFECT', 23, 'ETUIS PRECIOUS PERFECT DSR 2 IN 1 DISPENSER 12PC*10ML', null, '{"2025":null,"unite":null,"avis":null,"statistique 4D 6mois":null,"statistique 4D 6mois calculée":null}'::jsonb),
  ('PRECIOUS PERFECT', 24, 'ETUIS PRECIOUS PERFECT DSR 2 IN 1/ 2PC*10L', null, '{"2025":null,"unite":null,"avis":null,"statistique 4D 6mois":null,"statistique 4D 6mois calculée":null}'::jsonb),
  ('PRECIOUS PERFECT', 25, 'ETUIS SAVON PRECIOUS PERFECT RAD.WHITE F/B 150 GM', null, '{"2025":null,"unite":null,"avis":null,"statistique 4D 6mois":null,"statistique 4D 6mois calculée":null}'::jsonb),
  ('PRECIOUS PERFECT', 26, 'ETUIS SERUM PRECIOUS PERFECT 30ML', null, '{"2025":null,"unite":null,"avis":null,"statistique 4D 6mois":null,"statistique 4D 6mois calculée":null}'::jsonb),
  ('PRECIOUS PERFECT', 27, 'ETUIS TUBE CREME PRECIOUS PERFECT 70GR', null, '{"2025":null,"unite":null,"avis":null,"statistique 4D 6mois":null,"statistique 4D 6mois calculée":null}'::jsonb),
  ('PRECIOUS PERFECT', 28, 'SLEEVE CREME PRECIOUS PERFECT 125ML', null, '{"2025":null,"unite":null,"avis":null,"statistique 4D 6mois":null,"statistique 4D 6mois calculée":null}'::jsonb),
  ('PRECIOUS PERFECT', 29, 'SLEEVE CREME PRECIOUS PERFECT 250ML', null, '{"2025":null,"unite":null,"avis":null,"statistique 4D 6mois":null,"statistique 4D 6mois calculée":null}'::jsonb),
  ('PRECIOUS PERFECT', 30, 'SLEEVE CREME PRECIOUS PERFECT 500ML', null, '{"2025":null,"unite":null,"avis":null,"statistique 4D 6mois":null,"statistique 4D 6mois calculée":null}'::jsonb),
  ('PRECIOUS PERFECT', 31, 'SLEEVE HUIL PRECIOUS PERFECT 125ML', null, '{"2025":null,"unite":null,"avis":null,"statistique 4D 6mois":null,"statistique 4D 6mois calculée":null}'::jsonb),
  ('PRECIOUS PERFECT', 32, 'SLEEVE LAIT PRECIOUS PERFECT 125ML', null, '{"2025":null,"unite":null,"avis":null,"statistique 4D 6mois":null,"statistique 4D 6mois calculée":null}'::jsonb),
  ('PRECIOUS PERFECT', 33, 'SLEEVE LAIT PRECIOUS PERFECT 250ML', null, '{"2025":null,"unite":null,"avis":null,"statistique 4D 6mois":null,"statistique 4D 6mois calculée":null}'::jsonb),
  ('PRECIOUS PERFECT', 34, 'SLEEVE LAIT PRECIOUS PERFECT 500ML', null, '{"2025":null,"unite":null,"avis":null,"statistique 4D 6mois":null,"statistique 4D 6mois calculée":null}'::jsonb),
  ('PRECIOUS PERFECT', 35, 'TUBE VIDE CREME PRECIOUS PERFECT 70GR', null, '{"2025":null,"unite":null,"avis":null,"statistique 4D 6mois":null,"statistique 4D 6mois calculée":null}'::jsonb),
  ('PRECIOUS PERFECT', 36, 'CAPSULE PLAST SERUM 18/410 PINK P214C', null, '{"2025":null,"unite":null,"avis":null,"statistique 4D 6mois":null,"statistique 4D 6mois calculée":null}'::jsonb)
on conflict (gamme_statistique, ordre) do update set
  designation = excluded.designation,
  categorie = excluded.categorie,
  donnees = excluded.donnees;
