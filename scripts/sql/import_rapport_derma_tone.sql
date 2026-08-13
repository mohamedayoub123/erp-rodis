-- Import du rapport DERMA TONE (onboarding multi-gammes Statistique MP, lot 2).
-- 32 articles.
-- A executer dans Supabase SQL Editor (la table existe deja, creee pour MP COSM).

insert into public.rapport_gamme_statistique_mp
  (gamme_statistique, ordre, designation, categorie, donnees)
values
  ('DERMA TONE', 1, 'BASE ANGELS DREAM 338608-C (DERMA)', null, '{"2025":null,"unite":"LUZI","avis":null,"statistique 4D 6mois":600}'::jsonb),
  ('DERMA TONE', 2, 'BASE DERMA GEL 338608-G (GEL DOUCHE+SAVON)', null, '{"2025":null,"unite":"LUZI","avis":null,"statistique 4D 6mois":350,"designation_couleur":"00B050"}'::jsonb),
  ('DERMA TONE', 3, 'CARTON CREME DERMATONE 150ML', null, '{"2025":null,"unite":48,"avis":null,"statistique 4D 6mois":1000}'::jsonb),
  ('DERMA TONE', 4, 'CARTON CREME DERMATONE 300ML', null, '{"2025":null,"unite":24,"avis":null,"statistique 4D 6mois":1000}'::jsonb),
  ('DERMA TONE', 5, 'CARTON DSR DERMATONE 30ML', null, '{"2025":null,"unite":72,"avis":null,"statistique 4D 6mois":1000}'::jsonb),
  ('DERMA TONE', 6, 'CARTON GEL DOUCHE DERMATONE EXFL & CLAR. 1L', null, '{"2025":null,"unite":12,"avis":null,"statistique 4D 6mois":2000}'::jsonb),
  ('DERMA TONE', 7, 'CARTON GEL DOUCHE DERMATONE EXFL & CLAR. 500ML', null, '{"2025":null,"unite":24,"avis":null,"statistique 4D 6mois":2000}'::jsonb),
  ('DERMA TONE', 8, 'CARTON HUILE DERMATONE 90ML', null, '{"2025":null,"unite":48,"avis":null,"statistique 4D 6mois":1000}'::jsonb),
  ('DERMA TONE', 9, 'CARTON LAIT DERMATONE 200ML', null, '{"2025":null,"unite":36,"avis":null,"statistique 4D 6mois":2000}'::jsonb),
  ('DERMA TONE', 10, 'CARTON LAIT DERMATONE 400ML', null, '{"2025":null,"unite":24,"avis":null,"statistique 4D 6mois":2000}'::jsonb),
  ('DERMA TONE', 11, 'CARTON SAVON DERMATONE 200GR', null, '{"2025":null,"unite":48,"avis":null,"statistique 4D 6mois":1000}'::jsonb),
  ('DERMA TONE', 12, 'CARTON SERUM DERMATONE 30ML', null, '{"2025":null,"unite":48,"avis":null,"statistique 4D 6mois":1000}'::jsonb),
  ('DERMA TONE', 14, 'ETIQUETTE GEL DOUCHE DERMATONE CLAR. 1L', null, '{"2025":null,"unite":null,"avis":null,"statistique 4D 6mois":12000}'::jsonb),
  ('DERMA TONE', 15, 'ETIQUETTE GEL DOUCHE DERMATONE CLAR. 500ML', null, '{"2025":null,"unite":null,"avis":null,"statistique 4D 6mois":24000}'::jsonb),
  ('DERMA TONE', 16, 'ETIQUETTE GEL DOUCHE DERMATONE EXFL. 1L', null, '{"2025":null,"unite":null,"avis":null,"statistique 4D 6mois":12000}'::jsonb),
  ('DERMA TONE', 17, 'ETIQUETTE GEL DOUCHE DERMATONE EXFL. 500ML', null, '{"2025":null,"unite":null,"avis":null,"statistique 4D 6mois":24000}'::jsonb),
  ('DERMA TONE', 18, 'ETIQUETTE SERUM DERMATONE 30ML', null, '{"2025":null,"unite":null,"avis":null,"statistique 4D 6mois":48000}'::jsonb),
  ('DERMA TONE', 19, 'ETUIS CREME DERMATONE 150ML', null, '{"2025":null,"unite":null,"avis":null,"statistique 4D 6mois":48000}'::jsonb),
  ('DERMA TONE', 20, 'ETUIS CREME DERMATONE 300ML', null, '{"2025":null,"unite":null,"avis":null,"statistique 4D 6mois":24000}'::jsonb),
  ('DERMA TONE', 21, 'ETUIS DSR DERMATONE 30ML', null, '{"2025":null,"unite":null,"avis":null,"statistique 4D 6mois":72000}'::jsonb),
  ('DERMA TONE', 22, 'ETUIS HUILE DERMATONE 90ML', null, '{"2025":null,"unite":null,"avis":null,"statistique 4D 6mois":48000}'::jsonb),
  ('DERMA TONE', 23, 'ETUIS LAIT DERMATONE 200ML', null, '{"2025":null,"unite":null,"avis":null,"statistique 4D 6mois":72000}'::jsonb),
  ('DERMA TONE', 24, 'ETUIS LAIT DERMATONE 400ML', null, '{"2025":null,"unite":null,"avis":null,"statistique 4D 6mois":48000}'::jsonb),
  ('DERMA TONE', 25, 'ETUIS SAVON DERMATONE 200GR', null, '{"2025":null,"unite":null,"avis":null,"statistique 4D 6mois":48000}'::jsonb),
  ('DERMA TONE', 26, 'ETUIS SERUM DERMATONE 30ML', null, '{"2025":null,"unite":null,"avis":null,"statistique 4D 6mois":48000}'::jsonb),
  ('DERMA TONE', 28, 'SLEEVE CREME DERMATONE 150ML', null, '{"2025":null,"unite":null,"avis":null,"statistique 4D 6mois":48000}'::jsonb),
  ('DERMA TONE', 29, 'SLEEVE CREME DERMATONE 300ML', null, '{"2025":null,"unite":null,"avis":null,"statistique 4D 6mois":24000}'::jsonb),
  ('DERMA TONE', 30, 'SLEEVE DSR DERMATONE 30ML', null, '{"2025":null,"unite":null,"avis":null,"statistique 4D 6mois":72000}'::jsonb),
  ('DERMA TONE', 31, 'SLEEVE HUILE DERMATONE 90ML', null, '{"2025":null,"unite":null,"avis":null,"statistique 4D 6mois":48000}'::jsonb),
  ('DERMA TONE', 32, 'SLEEVE LAIT DERMATONE 200ML', null, '{"2025":null,"unite":null,"avis":null,"statistique 4D 6mois":72000}'::jsonb),
  ('DERMA TONE', 33, 'SLEEVE LAIT DERMATONE 400ML', null, '{"2025":null,"unite":null,"avis":null,"statistique 4D 6mois":48000}'::jsonb),
  ('DERMA TONE', 35, '28/410 SCREW LOTION PUMP DERMA JY8725', null, '{"2025":null,"unite":null,"avis":null,"statistique 4D 6mois":36000}'::jsonb)
on conflict (gamme_statistique, ordre) do update set
  designation = excluded.designation,
  categorie = excluded.categorie,
  donnees = excluded.donnees;
