-- Import du rapport MOROCCO SKIN (onboarding multi-gammes Statistique MP).
-- 33 articles.
-- A executer dans Supabase SQL Editor (la table existe deja, creee pour MP COSM).

insert into public.rapport_gamme_statistique_mp
  (gamme_statistique, ordre, designation, categorie, donnees)
values
  ('MOROCCO SKIN', 1, 'BASE ME20005232 ANTOINETTE (MOROC-SKIN)', null, '{"2025":1400,"unite":"CP","avis":100,"statistique 4D 6mois":1000}'::jsonb),
  ('MOROCCO SKIN', 2, 'BASE COS 31466', null, '{"2025":1000,"unite":"NP","avis":200,"statistique 4D 6mois":600}'::jsonb),
  ('MOROCCO SKIN', 3, 'CARTON CREME MOROCCO 150ML', null, '{"2025":950,"unite":"8DZ","avis":null,"statistique 4D 6mois":1500}'::jsonb),
  ('MOROCCO SKIN', 4, 'CARTON CREME MOROCCO 300ML', null, '{"2025":2100,"unite":"4DZ","avis":null,"statistique 4D 6mois":1500}'::jsonb),
  ('MOROCCO SKIN', 5, 'CARTON DSR MOROCCO 30ML', null, '{"2025":1900,"unite":"6DZ","avis":null,"statistique 4D 6mois":2000}'::jsonb),
  ('MOROCCO SKIN', 6, 'CARTON GEL DOUCHE MOROCCO 1L CLAR', null, '{"2025":1700,"unite":"1DZ","avis":null,"statistique 4D 6mois":2500}'::jsonb),
  ('MOROCCO SKIN', 7, 'CARTON GEL DOUCHE MOROCCO CLAR 500ML', null, '{"2025":1400,"unite":"2DZ","avis":null,"statistique 4D 6mois":2500}'::jsonb),
  ('MOROCCO SKIN', 8, 'CARTON GEL DOUCHE MOROCCO 1L EXF', null, '{"2025":4600,"unite":"1DZ","avis":2000,"statistique 4D 6mois":3000}'::jsonb),
  ('MOROCCO SKIN', 9, 'CARTON GEL DOUCHE MOROCCO EXFL 500ML', null, '{"2025":4400,"unite":"2DZ","avis":null,"statistique 4D 6mois":3000}'::jsonb),
  ('MOROCCO SKIN', 10, 'CARTON HUILE MOROCCO 90ML', null, '{"2025":1200,"unite":"4DZ","avis":null,"statistique 4D 6mois":2000}'::jsonb),
  ('MOROCCO SKIN', 11, 'CARTON LAIT MOROCCO 200ML', null, '{"2025":3400,"unite":"4DZ","avis":null,"statistique 4D 6mois":6000}'::jsonb),
  ('MOROCCO SKIN', 12, 'CARTON LAIT MOROCCO 400ML', null, '{"2025":4900,"unite":"2DZ","avis":0,"statistique 4D 6mois":6000}'::jsonb),
  ('MOROCCO SKIN', 13, 'CARTON SAVON MOROCCO 200GR', null, '{"2025":2650,"unite":"4DZ","avis":null,"statistique 4D 6mois":2000}'::jsonb),
  ('MOROCCO SKIN', 14, 'CARTON SERUM MOROCCO 30ML', null, '{"2025":1050,"unite":"4DZ","avis":null,"statistique 4D 6mois":2000}'::jsonb),
  ('MOROCCO SKIN', 15, 'CARTON SAVON NOIR MOROCCO SKIN 500GR', null, '{"2025":null,"unite":"2DZ","avis":2000,"statistique 4D 6mois":2000}'::jsonb),
  ('MOROCCO SKIN', 16, 'ETUIS DSR MOROCCO SKIN 30ML', null, '{"2025":null,"unite":null,"avis":0,"statistique 4D 6mois":144000}'::jsonb),
  ('MOROCCO SKIN', 17, 'ETUIS MOROCCO SKIN DSR DISPENSER 12*30ML', null, '{"2025":null,"unite":null,"avis":null,"statistique 4D 6mois":12000}'::jsonb),
  ('MOROCCO SKIN', 18, 'ETUIS SAVON MOROCCO SKIN 200GR', null, '{"2025":null,"unite":null,"avis":0,"statistique 4D 6mois":96000}'::jsonb),
  ('MOROCCO SKIN', 19, 'ETUIS SERUM MOROCCO SKIN 30ML', null, '{"2025":null,"unite":null,"avis":0,"statistique 4D 6mois":96000}'::jsonb),
  ('MOROCCO SKIN', 20, 'ETIQUETTE GEL DOUCHE MOROCCO SKIN CLARF. 500ML', null, '{"2025":null,"unite":null,"avis":null,"statistique 4D 6mois":60000}'::jsonb),
  ('MOROCCO SKIN', 21, 'ETIQUETTE GEL DOUCHE MOROCCO SKIN CLARF.1L', null, '{"2025":null,"unite":null,"avis":null,"statistique 4D 6mois":30000}'::jsonb),
  ('MOROCCO SKIN', 22, 'ETIQUETTE GEL DOUCHE MOROCCO SKIN EXFL. 1L', null, '{"2025":null,"unite":null,"avis":null,"statistique 4D 6mois":36000}'::jsonb),
  ('MOROCCO SKIN', 23, 'ETIQUETTE GEL DOUCHE MOROCCO SKIN EXFL. 500ML', null, '{"2025":null,"unite":null,"avis":null,"statistique 4D 6mois":72000,"designation_couleur":"FFFF00"}'::jsonb),
  ('MOROCCO SKIN', 24, 'ETIQUETTE SERUM MOROCCO SKIN 30ML', null, '{"2025":null,"unite":null,"avis":0,"statistique 4D 6mois":96000,"designation_couleur":"FFFF00"}'::jsonb),
  ('MOROCCO SKIN', 25, 'ETIQUETTE SAVON NOIR MOROCCO SKIN (258/70MM) 500GR', null, '{"2025":null,"unite":null,"avis":30000,"statistique 4D 6mois":48000}'::jsonb),
  ('MOROCCO SKIN', 26, 'ETIQUETTE SAVON NOIR MOROCCO SKIN (52MM) 500GR', null, '{"2025":null,"unite":null,"avis":30000,"statistique 4D 6mois":48000}'::jsonb),
  ('MOROCCO SKIN', 27, 'SLEEVE CREME MOROCCO SKIN 150ML', null, '{"2025":null,"unite":null,"avis":null,"statistique 4D 6mois":144000}'::jsonb),
  ('MOROCCO SKIN', 28, 'SLEEVE CREME MOROCCO SKIN 300ML', null, '{"2025":null,"unite":null,"avis":null,"statistique 4D 6mois":72000}'::jsonb),
  ('MOROCCO SKIN', 29, 'SLEEVE DSR MOROCCO SKIN 30ML', null, '{"2025":null,"unite":null,"avis":null,"statistique 4D 6mois":144000}'::jsonb),
  ('MOROCCO SKIN', 30, 'SLEEVE HUILE MOROCCO SKIN 90ML', null, '{"2025":null,"unite":null,"avis":null,"statistique 4D 6mois":96000}'::jsonb),
  ('MOROCCO SKIN', 31, 'SLEEVE LAIT MOROCCO SKIN 200ML', null, '{"2025":"VOIRE RECLAMTION","unite":null,"avis":0,"statistique 4D 6mois":288000}'::jsonb),
  ('MOROCCO SKIN', 32, 'SLEEVE LAIT MOROCCO SKIN 400ML', null, '{"2025":"VOIRE RECLAMTION","unite":null,"avis":0,"statistique 4D 6mois":144000}'::jsonb),
  ('MOROCCO SKIN', 33, '28/410 SCREW LOTION PUMP MOROCCO BA-215/7540C&1505C', null, '{"2025":null,"unite":null,"avis":null,"statistique 4D 6mois":90000}'::jsonb)
on conflict (gamme_statistique, ordre) do update set
  designation = excluded.designation,
  categorie = excluded.categorie,
  donnees = excluded.donnees;
