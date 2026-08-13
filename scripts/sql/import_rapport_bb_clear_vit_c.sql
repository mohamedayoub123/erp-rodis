-- Import du rapport BB CLEAR VIT C (onboarding multi-gammes Statistique MP, lot 2).
-- 36 articles. Un vrai doublon d'ordre existait dans le fichier source (2 articles differents avec le meme numero) : le 2e a ete renumerote pour respecter l'unicite en base, tout le reste garde son ordre d'origine.
-- A executer dans Supabase SQL Editor (la table existe deja, creee pour MP COSM).

insert into public.rapport_gamme_statistique_mp
  (gamme_statistique, ordre, designation, categorie, donnees)
values
  ('BB CLEAR VIT C', 1, 'BASE COS 31160 bb vitamine c', null, '{"2025":506,"unite":"NP","avis":null,"statistique 4D 6mois":500,"remarque":null}'::jsonb),
  ('BB CLEAR VIT C', 2, 'CARTON CREME BB CLEAR VITAMINE-C 140ML', null, '{"2025":330,"unite":"4dz","avis":null,"statistique 4D 6mois":1000,"remarque":null}'::jsonb),
  ('BB CLEAR VIT C', 3, 'CARTON CREME BB CLEAR VITAMINE-C 320ML', null, '{"2025":525,"unite":"2dz","avis":null,"statistique 4D 6mois":1000,"remarque":null}'::jsonb),
  ('BB CLEAR VIT C', 5, 'CARTON DSR BB CLEAR VITAMINE-C 30ML', null, '{"2025":390,"unite":"6dz","avis":null,"statistique 4D 6mois":0,"remarque":null}'::jsonb),
  ('BB CLEAR VIT C', 6, 'CARTON GEL DOUCHE BB CLEAR VITAMINE-C 600ML', null, '{"2025":"300  CLARI\n1900 EXFO","unite":"30 pcs","avis":null,"statistique 4D 6mois":3000,"remarque":null}'::jsonb),
  ('BB CLEAR VIT C', 7, 'CARTON HUILE BB CLEAR VITAMINE-C 60ML', null, '{"2025":"185\n2  N","unite":"6dz","avis":null,"statistique 4D 6mois":500,"remarque":null}'::jsonb),
  ('BB CLEAR VIT C', 8, 'CARTON LAIT BB CLEAR VITAMINE-C 200ML', null, '{"2025":840,"unite":"3dz","avis":null,"statistique 4D 6mois":1500,"remarque":"NOUVEAU"}'::jsonb),
  ('BB CLEAR VIT C', 9, 'CARTON LAIT BB CLEAR VITAMINE-C 300ML', null, '{"2025":755,"unite":"2dz","avis":null,"statistique 4D 6mois":2000,"remarque":null}'::jsonb),
  ('BB CLEAR VIT C', 11, 'CARTON SAVON BB CLEAR VITAMINE-C190GR', null, '{"2025":340,"unite":"2dz","avis":null,"statistique 4D 6mois":1000,"remarque":null}'::jsonb),
  ('BB CLEAR VIT C', 12, 'CARTON SERUM BB CLEAR VITAMINE-C 30ML', null, '{"2025":"150 \n210 N","unite":"5dz","avis":null,"statistique 4D 6mois":1000,"remarque":null}'::jsonb),
  ('BB CLEAR VIT C', 13, 'CARTON TUBE CREME BB CLEAR VITAMINE-C 50ML', null, '{"2025":212,"unite":"6dz","avis":null,"statistique 4D 6mois":500,"remarque":null}'::jsonb),
  ('BB CLEAR VIT C', 14, 'ETIQUETTE GEL DOUCHE BB CLEAR VITAMINE-C CLAR. 600ML (BACK)', null, '{"2025":null,"unite":null,"avis":null,"statistique 4D 6mois":30000,"remarque":null}'::jsonb),
  ('BB CLEAR VIT C', 15, 'ETIQUETTE GEL DOUCHE BB CLEAR VITAMINE-C CLAR. 600ML (FRONT)', null, '{"2025":null,"unite":null,"avis":null,"statistique 4D 6mois":30000,"remarque":null}'::jsonb),
  ('BB CLEAR VIT C', 16, 'ETIQUETTE GEL DOUCHE BB CLEAR VITAMINE-C EXFL. 600ML (BACK)', null, '{"2025":null,"unite":null,"avis":null,"statistique 4D 6mois":15000,"remarque":null}'::jsonb),
  ('BB CLEAR VIT C', 17, 'ETIQUETTE GEL DOUCHE BB CLEAR VITAMINE-C EXFL. 600ML (FRONT)', null, '{"2025":null,"unite":null,"avis":null,"statistique 4D 6mois":15000,"remarque":null}'::jsonb),
  ('BB CLEAR VIT C', 18, 'ETIQUETTE SERUM BB CLEAR VITAMINE-C 30ML', null, '{"2025":null,"unite":null,"avis":null,"statistique 4D 6mois":60000,"remarque":null}'::jsonb),
  ('BB CLEAR VIT C', 19, 'ETUIS CREME BB CLEAR VITAMINE-C 140ML', null, '{"2025":null,"unite":null,"avis":null,"statistique 4D 6mois":48000,"remarque":null}'::jsonb),
  ('BB CLEAR VIT C', 38, 'ETUIS CREME BB CLEAR VITAMINE-C 140ML', null, '{"2025":null,"unite":"ancien\ndimession","avis":null,"statistique 4D 6mois":null,"remarque":null}'::jsonb),
  ('BB CLEAR VIT C', 21, 'ETUIS CREME BB CLEAR VITAMINE-C 320ML', null, '{"2025":null,"unite":null,"avis":null,"statistique 4D 6mois":24000,"remarque":null}'::jsonb),
  ('BB CLEAR VIT C', 22, 'ETUIS DSR BB CLEAR VITAMINE-C 30ML', null, '{"2025":null,"unite":null,"avis":null,"statistique 4D 6mois":0,"remarque":null}'::jsonb),
  ('BB CLEAR VIT C', 23, 'ETUIS DSR BB CLEAR VITAMINE-C DISPENSER 12PC*30ML', null, '{"2025":null,"unite":null,"avis":null,"statistique 4D 6mois":0,"remarque":null}'::jsonb),
  ('BB CLEAR VIT C', 24, 'ETUIS HUILE BB CLEAR VITAMINE-C 60ML', null, '{"2025":null,"unite":null,"avis":null,"statistique 4D 6mois":36000,"remarque":null}'::jsonb),
  ('BB CLEAR VIT C', 25, 'ETUIS LAIT BB CLEAR VITAMINE-C 200ML', null, '{"2025":null,"unite":null,"avis":null,"statistique 4D 6mois":54000,"remarque":null}'::jsonb),
  ('BB CLEAR VIT C', 39, 'ETUIS LAIT BB CLEAR VITAMINE-C 200ML', null, '{"2025":null,"unite":"ancien\ndimenssion","avis":null,"statistique 4D 6mois":null,"remarque":null}'::jsonb),
  ('BB CLEAR VIT C', 26, 'ETUIS LAIT BB CLEAR VITAMINE-C 300ML', null, '{"2025":null,"unite":null,"avis":null,"statistique 4D 6mois":48000,"remarque":null}'::jsonb),
  ('BB CLEAR VIT C', 28, 'ETUIS SAVON BB CLEAR VITAMINE-C CLARI. 190GR', null, '{"2025":null,"unite":null,"avis":null,"statistique 4D 6mois":12000,"remarque":null}'::jsonb),
  ('BB CLEAR VIT C', 29, 'ETUIS SAVON BB CLEAR VITAMINE-C EXFL. 190GR', null, '{"2025":null,"unite":null,"avis":null,"statistique 4D 6mois":12000,"remarque":null}'::jsonb),
  ('BB CLEAR VIT C', 30, 'ETUIS SERUM BB CLEAR VITAMINE-C 30ML', null, '{"2025":null,"unite":null,"avis":null,"statistique 4D 6mois":60000,"remarque":null}'::jsonb),
  ('BB CLEAR VIT C', 31, 'ETUIS TUBE CREME BB CLEAR VITAMINE-C 50ML', null, '{"2025":null,"unite":null,"avis":null,"statistique 4D 6mois":36000,"remarque":null}'::jsonb),
  ('BB CLEAR VIT C', 32, 'SLEEVE CREME BB CLEAR VITAMINE-C 140ML', null, '{"2025":null,"unite":null,"avis":null,"statistique 4D 6mois":48000,"remarque":null}'::jsonb),
  ('BB CLEAR VIT C', 33, 'SLEEVE CREME BB CLEAR VITAMINE-C 320ML', null, '{"2025":null,"unite":null,"avis":null,"statistique 4D 6mois":24000,"remarque":null}'::jsonb),
  ('BB CLEAR VIT C', 34, 'SLEEVE DSR BB CLEAR VITAMINE-C 30ML', null, '{"2025":null,"unite":null,"avis":null,"statistique 4D 6mois":0,"remarque":null}'::jsonb),
  ('BB CLEAR VIT C', 35, 'SLEEVE HUILE BB CLEAR VITAMINE-C 60ML', null, '{"2025":null,"unite":null,"avis":null,"statistique 4D 6mois":36000,"remarque":null}'::jsonb),
  ('BB CLEAR VIT C', 36, 'SLEEVE LAIT BB CLEAR VITAMINE-C 200ML', null, '{"2025":null,"unite":null,"avis":null,"statistique 4D 6mois":54000,"remarque":null}'::jsonb),
  ('BB CLEAR VIT C', 37, 'SLEEVE LAIT BB CLEAR VITAMINE-C 300ML', null, '{"2025":null,"unite":null,"avis":null,"statistique 4D 6mois":48000,"remarque":null}'::jsonb),
  ('BB CLEAR VIT C', 40, 'TUBE VIDE CREME BB CLEAR VITAMINE-C 50ML', null, '{"2025":null,"unite":null,"avis":null,"statistique 4D 6mois":36000,"remarque":null}'::jsonb)
on conflict (gamme_statistique, ordre) do update set
  designation = excluded.designation,
  categorie = excluded.categorie,
  donnees = excluded.donnees;
