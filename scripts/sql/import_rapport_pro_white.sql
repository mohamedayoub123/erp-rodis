-- Import du rapport PRO-WHITE (onboarding multi-gammes Statistique MP).
-- 37 articles.
-- A executer dans Supabase SQL Editor (la table existe deja, creee pour MP COSM).

insert into public.rapport_gamme_statistique_mp
  (gamme_statistique, ordre, designation, categorie, donnees)
values
  ('PRO-WHITE', 1, 'BASE COS 31275 - PRO WHITE', null, '{"2025":2000,"unite":"NP","avis":300,"statistique 4D 6mois":1000}'::jsonb),
  ('PRO-WHITE', 2, 'BASE COS 30826  SAVON COCOCLEAR', null, '{"2025":"50 /AN UTILISE DANS SAV PROWHITE","unite":"NP","avis":25,"statistique 4D 6mois":50}'::jsonb),
  ('PRO-WHITE', 37, 'BASE AROMA FRUTAL COCO', null, '{"2025":"150/AN UTILISE DANS GEL PROWHITE","unite":"LUZI","avis":25,"statistique 4D 6mois":150}'::jsonb),
  ('PRO-WHITE', 3, 'CARTON CREME PRO WHITE 220ML', null, '{"2025":430,"unite":"3dz","avis":null,"statistique 4D 6mois":1000}'::jsonb),
  ('PRO-WHITE', 4, 'CARTON CREME PRO WHITE 400ML', null, '{"2025":1150,"unite":"2dz","avis":null,"statistique 4D 6mois":1000}'::jsonb),
  ('PRO-WHITE', 5, 'CARTON DSR PRO WHITE 30ML', null, '{"2025":1960,"unite":"6dz","avis":null,"statistique 4D 6mois":2000}'::jsonb),
  ('PRO-WHITE', 6, 'CARTON GEL DOUCHE PRO WHITE 750ML', null, '{"2025":"2000  clarif\n7000  exfo","unite":"1dz","avis":3000,"statistique 4D 6mois":9000}'::jsonb),
  ('PRO-WHITE', 7, 'CARTON HUILE PRO WHITE 90ML', null, '{"2025":632,"unite":"4dz","avis":null,"statistique 4D 6mois":500}'::jsonb),
  ('PRO-WHITE', 8, 'CARTON LAIT PRO WHITE 250ML', null, '{"2025":5900,"unite":"3dz","avis":null,"statistique 4D 6mois":6000}'::jsonb),
  ('PRO-WHITE', 9, 'CARTON LAIT PRO WHITE 500ML', null, '{"2025":7600,"unite":"2dz","avis":null,"statistique 4D 6mois":7000}'::jsonb),
  ('PRO-WHITE', 10, 'CARTON SAVON PRO WHITE 200GR', null, '{"2025":2900,"unite":"4dz","avis":0,"statistique 4D 6mois":2000}'::jsonb),
  ('PRO-WHITE', 11, 'CARTON SERUM PRO WHITE 30ML', null, '{"2025":400,"unite":"6dz","avis":null,"statistique 4D 6mois":1000}'::jsonb),
  ('PRO-WHITE', 12, 'CARTON TUBE PRO WHITE 70G', null, '{"2025":330,"unite":"6dz","avis":null,"statistique 4D 6mois":500}'::jsonb),
  ('PRO-WHITE', 13, 'ETIQUETTE GEL DOUCHE PRO WHITE CLAR. 750ML ( FRONT)', null, '{"2025":null,"unite":null,"avis":null,"statistique 4D 6mois":24000}'::jsonb),
  ('PRO-WHITE', 14, 'ETIQUETTE GEL DOUCHE PRO WHITE CLAR. 750ML (BACK)', null, '{"2025":null,"unite":null,"avis":null,"statistique 4D 6mois":24000}'::jsonb),
  ('PRO-WHITE', 15, 'ETIQUETTE GEL DOUCHE PRO WHITE EXFL. 750ML ( FRONT)', null, '{"2025":null,"unite":null,"avis":20000,"statistique 4D 6mois":84000}'::jsonb),
  ('PRO-WHITE', 16, 'ETIQUETTE GEL DOUCHE PRO WHITE EXFL. 750ML (BACK)', null, '{"2025":null,"unite":null,"avis":10000,"statistique 4D 6mois":84000}'::jsonb),
  ('PRO-WHITE', 17, 'ETIQUETTE SERUM PRO WHITE 30ML', null, '{"2025":null,"unite":null,"avis":null,"statistique 4D 6mois":72000}'::jsonb),
  ('PRO-WHITE', 18, 'ETUIS CREME PRO WHITE 220ML', null, '{"2025":null,"unite":null,"avis":null,"statistique 4D 6mois":36000}'::jsonb),
  ('PRO-WHITE', 19, 'ETUIS CREME PRO WHITE 400ML', null, '{"2025":null,"unite":null,"avis":null,"statistique 4D 6mois":24000,"designation_couleur":"FFFF00"}'::jsonb),
  ('PRO-WHITE', 20, 'ETUIS DSR PRO WHITE 30ML', null, '{"2025":null,"unite":null,"avis":null,"statistique 4D 6mois":144000}'::jsonb),
  ('PRO-WHITE', 21, 'ETUIS HUILE PRO WHITE 90ML', null, '{"2025":null,"unite":null,"avis":null,"statistique 4D 6mois":24000}'::jsonb),
  ('PRO-WHITE', 22, 'ETUIS LAIT PRO WHITE 250ML', null, '{"2025":null,"unite":null,"avis":null,"statistique 4D 6mois":216000}'::jsonb),
  ('PRO-WHITE', 23, 'ETUIS LAIT PRO WHITE 500ML', null, '{"2025":null,"unite":null,"avis":null,"statistique 4D 6mois":168000}'::jsonb),
  ('PRO-WHITE', 24, 'ETUIS PRO WHITE DSR DISPENSER 12PC*30ML', null, '{"2025":null,"unite":null,"avis":null,"statistique 4D 6mois":12000,"designation_couleur":"FFFF00"}'::jsonb),
  ('PRO-WHITE', 25, 'ETUIS SAVON PRO WHITE 200GR', null, '{"2025":null,"unite":null,"avis":null,"statistique 4D 6mois":96000,"designation_couleur":"FFFF00"}'::jsonb),
  ('PRO-WHITE', 26, 'ETUIS SERUM PRO WHITE 30ML', null, '{"2025":null,"unite":null,"avis":null,"statistique 4D 6mois":72000}'::jsonb),
  ('PRO-WHITE', 27, 'ETUIS TUBE PRO WHITE 70GR', null, '{"2025":null,"unite":null,"avis":null,"statistique 4D 6mois":36000}'::jsonb),
  ('PRO-WHITE', 28, 'SLEEVE CREME PRO WHITE 220ML', null, '{"2025":null,"unite":null,"avis":null,"statistique 4D 6mois":36000}'::jsonb),
  ('PRO-WHITE', 29, 'SLEEVE CREME PRO WHITE 400ML', null, '{"2025":null,"unite":null,"avis":null,"statistique 4D 6mois":24000}'::jsonb),
  ('PRO-WHITE', 30, 'SLEEVE DSR PRO WHITE 30ML', null, '{"2025":null,"unite":null,"avis":null,"statistique 4D 6mois":144000,"designation_couleur":"FFFF00"}'::jsonb),
  ('PRO-WHITE', 31, 'SLEEVE HUILE PRO WHITE 90ML', null, '{"2025":null,"unite":null,"avis":null,"statistique 4D 6mois":24000}'::jsonb),
  ('PRO-WHITE', 32, 'SLEEVE LAIT PRO WHITE 250ML', null, '{"2025":null,"unite":null,"avis":null,"statistique 4D 6mois":216000}'::jsonb),
  ('PRO-WHITE', 33, 'SLEEVE LAIT PRO WHITE 500ML', null, '{"2025":null,"unite":null,"avis":null,"statistique 4D 6mois":168000}'::jsonb),
  ('PRO-WHITE', 34, 'GLASS BOTTLE 30ML (AMBER) SERUM', null, '{"2025":null,"unite":null,"avis":null,"statistique 4D 6mois":null}'::jsonb),
  ('PRO-WHITE', 35, 'PIPETTE SERUM 18/410 GOLD', null, '{"2025":null,"unite":null,"avis":null,"statistique 4D 6mois":null}'::jsonb),
  ('PRO-WHITE', 36, 'TUBE VIDE PRO WHITE 70GR', null, '{"2025":null,"unite":null,"avis":null,"statistique 4D 6mois":36000}'::jsonb)
on conflict (gamme_statistique, ordre) do update set
  designation = excluded.designation,
  categorie = excluded.categorie,
  donnees = excluded.donnees;
