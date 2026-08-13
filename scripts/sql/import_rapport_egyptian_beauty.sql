-- Import du rapport EGYPTIAN BEAUTY (onboarding multi-gammes Statistique MP, lot 2).
-- 33 articles.
-- A executer dans Supabase SQL Editor (la table existe deja, creee pour MP COSM).

insert into public.rapport_gamme_statistique_mp
  (gamme_statistique, ordre, designation, categorie, donnees)
values
  ('EGYPTIAN BEAUTY', 1, 'BASE BEAUTIFUL CLEOPATRA 336205', null, '{"unite":"luzi","avis":null,"statistique 4D 6mois":400,"remarque":null}'::jsonb),
  ('EGYPTIAN BEAUTY', 2, 'BASE BEAUTIFUL CLEOPATRA 336205-C', null, '{"unite":"luzi","avis":null,"statistique 4D 6mois":150,"remarque":"Gel douche"}'::jsonb),
  ('EGYPTIAN BEAUTY', 3, 'BASE BEAUTIFUL CLEOPATRA 336205-E', null, '{"unite":"luzi","avis":null,"statistique 4D 6mois":100,"remarque":"Savon"}'::jsonb),
  ('EGYPTIAN BEAUTY', 4, 'CARTON CREME EGYPTIAN BEAUTY 125ML', null, '{"unite":48,"avis":null,"statistique 4D 6mois":2000,"remarque":null}'::jsonb),
  ('EGYPTIAN BEAUTY', 5, 'CARTON CREME EGYPTIAN BEAUTY 300ML', null, '{"unite":24,"avis":null,"statistique 4D 6mois":2000,"remarque":null}'::jsonb),
  ('EGYPTIAN BEAUTY', 6, 'CARTON DSR EGYPTIAN BEAUTY 30ML', null, '{"unite":72,"avis":null,"statistique 4D 6mois":3000,"remarque":null}'::jsonb),
  ('EGYPTIAN BEAUTY', 7, 'CARTON GEL DOUCHE EGYPTIAN BEAUTY EXFO/CLAR 1L', null, '{"unite":12,"avis":null,"statistique 4D 6mois":5000,"remarque":null}'::jsonb),
  ('EGYPTIAN BEAUTY', 8, 'CARTON GEL DOUCHE EGYPTIAN BEAUTY EXFO/CLAR 500ML', null, '{"unite":12,"avis":null,"statistique 4D 6mois":5000,"remarque":null}'::jsonb),
  ('EGYPTIAN BEAUTY', 9, 'CARTON HUILE EGYPTIAN BEAUTY 90ML', null, '{"unite":48,"avis":null,"statistique 4D 6mois":2000,"remarque":null}'::jsonb),
  ('EGYPTIAN BEAUTY', 10, 'CARTON LAIT EGYPTIAN BEAUTY 250ML', null, '{"unite":24,"avis":null,"statistique 4D 6mois":5000,"remarque":null}'::jsonb),
  ('EGYPTIAN BEAUTY', 11, 'CARTON LAIT EGYPTIAN BEAUTY 500ML', null, '{"unite":12,"avis":null,"statistique 4D 6mois":5000,"remarque":null}'::jsonb),
  ('EGYPTIAN BEAUTY', 12, 'CARTON SAVON EGYPTIAN BEAUTY 180GR', null, '{"unite":48,"avis":null,"statistique 4D 6mois":2000,"remarque":null}'::jsonb),
  ('EGYPTIAN BEAUTY', 13, 'CARTON SERUM EGYPTIAN BEAUTY 30ML', null, '{"unite":36,"avis":null,"statistique 4D 6mois":2000,"remarque":null}'::jsonb),
  ('EGYPTIAN BEAUTY', 14, 'ETIQUETTE GEL DOUCHE EGYPTIAN BEAUTY CLARF. 1L', null, '{"unite":null,"avis":null,"statistique 4D 6mois":36000,"remarque":null}'::jsonb),
  ('EGYPTIAN BEAUTY', 15, 'ETIQUETTE GEL DOUCHE EGYPTIAN BEAUTY CLARF. 500ML', null, '{"unite":null,"avis":null,"statistique 4D 6mois":36000,"remarque":null}'::jsonb),
  ('EGYPTIAN BEAUTY', 16, 'ETIQUETTE GEL DOUCHE EGYPTIAN BEAUTY EXFL. 1L', null, '{"unite":null,"avis":null,"statistique 4D 6mois":24000,"remarque":null}'::jsonb),
  ('EGYPTIAN BEAUTY', 17, 'ETIQUETTE GEL DOUCHE EGYPTIAN BEAUTY EXFL. 500ML', null, '{"unite":null,"avis":null,"statistique 4D 6mois":24000,"remarque":null}'::jsonb),
  ('EGYPTIAN BEAUTY', 18, 'ETIQUETTE SERUM EGYPTIAN BEAUTY 30ML', null, '{"unite":null,"avis":null,"statistique 4D 6mois":72000,"remarque":null}'::jsonb),
  ('EGYPTIAN BEAUTY', 19, 'ETUIS CREME EGYPTIAN BEAUTY 125ML', null, '{"unite":null,"avis":null,"statistique 4D 6mois":96000,"remarque":null}'::jsonb),
  ('EGYPTIAN BEAUTY', 20, 'ETUIS CREME EGYPTIAN BEAUTY 300ML', null, '{"unite":null,"avis":null,"statistique 4D 6mois":48000,"remarque":null}'::jsonb),
  ('EGYPTIAN BEAUTY', 21, 'ETUIS DSR EGYPTIAN BEAUTY 30ML', null, '{"unite":null,"avis":null,"statistique 4D 6mois":216000,"remarque":null}'::jsonb),
  ('EGYPTIAN BEAUTY', 22, 'ETUIS HUILE EGYPTIAN BEAUTY 90ML', null, '{"unite":null,"avis":null,"statistique 4D 6mois":96000,"remarque":null}'::jsonb),
  ('EGYPTIAN BEAUTY', 23, 'ETUIS LAIT EGYPTIAN BEAUTY 250ML', null, '{"unite":null,"avis":null,"statistique 4D 6mois":120000,"remarque":null}'::jsonb),
  ('EGYPTIAN BEAUTY', 24, 'ETUIS LAIT EGYPTIAN BEAUTY 500ML', null, '{"unite":null,"avis":null,"statistique 4D 6mois":60000,"remarque":null}'::jsonb),
  ('EGYPTIAN BEAUTY', 25, 'ETUIS SAVON EGYPTIAN BEAUTY 180G', null, '{"unite":null,"avis":null,"statistique 4D 6mois":96000,"remarque":null}'::jsonb),
  ('EGYPTIAN BEAUTY', 26, 'ETUIS SERUM EGYPTIAN BEAUTY 30ML', null, '{"unite":null,"avis":null,"statistique 4D 6mois":72000,"remarque":null}'::jsonb),
  ('EGYPTIAN BEAUTY', 27, 'SLEEVE CREME EGYPTIAN BEAUTY 125ML', null, '{"unite":null,"avis":null,"statistique 4D 6mois":96000,"remarque":null}'::jsonb),
  ('EGYPTIAN BEAUTY', 28, 'SLEEVE CREME EGYPTIAN BEAUTY 300ML', null, '{"unite":null,"avis":null,"statistique 4D 6mois":48000,"remarque":null}'::jsonb),
  ('EGYPTIAN BEAUTY', 29, 'SLEEVE DSR EGYPTIAN BEAUTY 30ML', null, '{"unite":null,"avis":null,"statistique 4D 6mois":216000,"remarque":null}'::jsonb),
  ('EGYPTIAN BEAUTY', 30, 'SLEEVE HUILE EGYPTIAN BEAUTY 90ML', null, '{"unite":null,"avis":null,"statistique 4D 6mois":96000,"remarque":null}'::jsonb),
  ('EGYPTIAN BEAUTY', 31, 'SLEEVE LAIT EGYPTIAN BEAUTY 250ML', null, '{"unite":null,"avis":null,"statistique 4D 6mois":120000,"remarque":null}'::jsonb),
  ('EGYPTIAN BEAUTY', 32, 'SLEEVE LAIT EGYPTIAN BEAUTY 500ML', null, '{"unite":null,"avis":null,"statistique 4D 6mois":60000,"remarque":null}'::jsonb),
  ('EGYPTIAN BEAUTY', 33, '28/410 SCREW LOTION PUMP EGYPTIAN BB-205/302C&7506C', null, '{"unite":null,"avis":null,"statistique 4D 6mois":72000,"remarque":null}'::jsonb)
on conflict (gamme_statistique, ordre) do update set
  designation = excluded.designation,
  categorie = excluded.categorie,
  donnees = excluded.donnees;
