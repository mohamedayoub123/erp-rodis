-- Import du rapport COCO CLEAR (onboarding multi-gammes Statistique MP, lot 2).
-- 33 articles.
-- A executer dans Supabase SQL Editor (la table existe deja, creee pour MP COSM).

insert into public.rapport_gamme_statistique_mp
  (gamme_statistique, ordre, designation, categorie, donnees)
values
  ('COCO CLEAR', 1, '28/410 SCREW LOTION PUMP TRANS BLEU COCO CLEAR PANT 318C', null, '{"2025":null,"unite":null,"avis":null,"statistique 4D 6mois":100000,"remarque":null}'::jsonb),
  ('COCO CLEAR', 2, 'BASE COS 30532 - COCO CL', null, '{"2025":270,"unite":"NP","avis":null,"statistique 4D 6mois":200,"remarque":null}'::jsonb),
  ('COCO CLEAR', 3, 'BASE COS 30826  SAVON COCOCLEAR', null, '{"2025":"UTILISE DANS SAV PROWHITE","unite":"NP","avis":null,"statistique 4D 6mois":"VOIRE PROWHITE","remarque":"A vérifier la conso de cette base pour le gel douche pro white "}'::jsonb),
  ('COCO CLEAR', 4, 'BASE AROMA FRUTAL COCO', null, '{"2025":"UTILISE DANS GEL PROWHITE","unite":"LUZI","avis":null,"statistique 4D 6mois":"VOIRE PROWHITE","remarque":null}'::jsonb),
  ('COCO CLEAR', 5, 'CARTON CREME COCO CLEAR 140ML', null, '{"2025":200,"unite":"6dz","avis":null,"statistique 4D 6mois":500,"remarque":null}'::jsonb),
  ('COCO CLEAR', 6, 'CARTON CREME COCO CLEAR 320ML', null, '{"2025":350,"unite":"3dz","avis":0,"statistique 4D 6mois":500,"remarque":null}'::jsonb),
  ('COCO CLEAR', 7, 'CARTON DSR COCO CLEAR 30ML', null, '{"2025":9,"unite":"6dz","avis":null,"statistique 4D 6mois":250,"remarque":null}'::jsonb),
  ('COCO CLEAR', 8, 'CARTON GEL DOUCHE COCO CLEAR 1L', null, '{"2025":50,"unite":"1dz","avis":null,"statistique 4D 6mois":250,"remarque":null}'::jsonb),
  ('COCO CLEAR', 9, 'CARTON GEL DOUCHE COCO CLEAR 500ML', null, '{"2025":70,"unite":"2dz","avis":null,"statistique 4D 6mois":250,"remarque":null}'::jsonb),
  ('COCO CLEAR', 10, 'CARTON GEL DOUCHE COCO CLEAR EXFL. 500ML', null, '{"2025":120,"unite":"2dz","avis":null,"statistique 4D 6mois":250,"remarque":null}'::jsonb),
  ('COCO CLEAR', 11, 'CARTON HUILE COCO CLEAR 125ML', null, '{"2025":74,"unite":"4dz","avis":null,"statistique 4D 6mois":250,"remarque":null}'::jsonb),
  ('COCO CLEAR', 12, 'CARTON LAIT COCO CLEAR 200ML', null, '{"2025":250,"unite":"4dz","avis":null,"statistique 4D 6mois":2000,"remarque":null}'::jsonb),
  ('COCO CLEAR', 13, 'CARTON LAIT COCO CLEAR 300ML', null, '{"2025":2000,"unite":"3dz","avis":null,"statistique 4D 6mois":3000,"remarque":null}'::jsonb),
  ('COCO CLEAR', 14, 'CARTON LAIT COCO CLEAR 500ML', null, '{"2025":1050,"unite":"2dz","avis":null,"statistique 4D 6mois":2000,"remarque":null}'::jsonb),
  ('COCO CLEAR', 15, 'CARTON SERUM COCO CLEAR', null, '{"2025":74,"unite":"4dz","avis":null,"statistique 4D 6mois":250,"remarque":null}'::jsonb),
  ('COCO CLEAR', 16, 'CARTON SAVON COCO CLEAR 150GR', null, '{"2025":84,"unite":"4dz","avis":null,"statistique 4D 6mois":250,"remarque":null}'::jsonb),
  ('COCO CLEAR', 17, 'CARTON TUBE CREME COCO CLEAR 70GR', null, '{"2025":150,"unite":null,"avis":null,"statistique 4D 6mois":250,"remarque":null}'::jsonb),
  ('COCO CLEAR', 18, 'ETIQUETTE GEL DOUCHE COCO CLEAR 1L 17*6,7CM', null, '{"2025":"Fond Blanc","unite":null,"avis":null,"statistique 4D 6mois":3000,"remarque":null}'::jsonb),
  ('COCO CLEAR', 19, 'ETIQUETTE GEL DOUCHE COCO CLEAR 500ml', null, '{"2025":"Fond Blanc","unite":null,"avis":null,"statistique 4D 6mois":6000,"remarque":null}'::jsonb),
  ('COCO CLEAR', 20, 'ETIQUETTE GEL DOUCHE COCO CLEAR EXFL. 500ML', null, '{"2025":null,"unite":null,"avis":null,"statistique 4D 6mois":6000,"remarque":null}'::jsonb),
  ('COCO CLEAR', 21, 'ETIQUETTE SERUM COCO CLEAR 30ML', null, '{"2025":null,"unite":null,"avis":null,"statistique 4D 6mois":12000,"remarque":null}'::jsonb),
  ('COCO CLEAR', 22, 'ETUIS DSR COCO CLEAR 30ML', null, '{"2025":null,"unite":null,"avis":null,"statistique 4D 6mois":18000,"remarque":null}'::jsonb),
  ('COCO CLEAR', 23, 'ETUIS SAVON COCO CLEAR 150G', null, '{"2025":null,"unite":null,"avis":null,"statistique 4D 6mois":12000,"remarque":null}'::jsonb),
  ('COCO CLEAR', 24, 'ETUIS SERUM COCO CLEAR 30 ML', null, '{"2025":null,"unite":null,"avis":0,"statistique 4D 6mois":12000,"remarque":null}'::jsonb),
  ('COCO CLEAR', 33, 'ETUIS TUBE CREME COCO CLEAR 70GR', null, '{"2025":null,"unite":null,"avis":null,"statistique 4D 6mois":null,"remarque":null}'::jsonb),
  ('COCO CLEAR', 25, 'SLEEVE CREME COCO CLEAR 140ML', null, '{"2025":null,"unite":null,"avis":null,"statistique 4D 6mois":36000,"remarque":null}'::jsonb),
  ('COCO CLEAR', 26, 'SLEEVE CREME COCO CLEAR 320ML', null, '{"2025":null,"unite":null,"avis":null,"statistique 4D 6mois":18000,"remarque":null}'::jsonb),
  ('COCO CLEAR', 27, 'SLEEVE DSR COCO CLEAR 30ML', null, '{"2025":null,"unite":null,"avis":null,"statistique 4D 6mois":18000,"remarque":null}'::jsonb),
  ('COCO CLEAR', 28, 'SLEEVE HUILE COCO CLEAR 125 ML', null, '{"2025":null,"unite":null,"avis":null,"statistique 4D 6mois":12000,"remarque":null}'::jsonb),
  ('COCO CLEAR', 29, 'SLEEVE LAIT COCO CLEAR 200ML', null, '{"2025":null,"unite":null,"avis":null,"statistique 4D 6mois":96000,"remarque":null}'::jsonb),
  ('COCO CLEAR', 30, 'SLEEVE LAIT COCO CLEAR 300ML', null, '{"2025":null,"unite":null,"avis":null,"statistique 4D 6mois":108000,"remarque":null,"designation_couleur":"FFFF00"}'::jsonb),
  ('COCO CLEAR', 31, 'SLEEVE LAIT COCO CLEAR 500ML', null, '{"2025":null,"unite":null,"avis":null,"statistique 4D 6mois":48000,"remarque":null,"designation_couleur":"00B050"}'::jsonb),
  ('COCO CLEAR', 32, 'CAPSULE PLAST SERUM 18/410 GREEN TO BLUE P3252C', null, '{"2025":null,"unite":null,"avis":null,"statistique 4D 6mois":12000,"remarque":null}'::jsonb)
on conflict (gamme_statistique, ordre) do update set
  designation = excluded.designation,
  categorie = excluded.categorie,
  donnees = excluded.donnees;
