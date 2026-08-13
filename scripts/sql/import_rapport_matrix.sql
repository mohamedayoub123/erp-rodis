-- Import du rapport MATRIX (onboarding multi-gammes Statistique MP).
-- 42 articles. Fichier source multi-onglets : ordre renumerote sequentiellement (1..42), la sous-famille d'origine est gardee dans la colonne categorie.
-- A executer dans Supabase SQL Editor (la table existe deja, creee pour MP COSM).

insert into public.rapport_gamme_statistique_mp
  (gamme_statistique, ordre, designation, categorie, donnees)
values
  ('MATRIX', 1, 'CARTON GEL MATRIX 100G', 'Matrix', '{"unite":null,"avis":0,"statistique 4D 6 mois":200,"remarque":60}'::jsonb),
  ('MATRIX', 2, 'CARTON GEL MATRIX 15G', 'Matrix', '{"unite":null,"avis":null,"statistique 4D 6 mois":0,"remarque":null}'::jsonb),
  ('MATRIX', 3, 'CARTON GEL MATRIX 30G', 'Matrix', '{"unite":null,"avis":null,"statistique 4D 6 mois":0,"remarque":null}'::jsonb),
  ('MATRIX', 4, 'CARTON MATRIX 125', 'Matrix', '{"unite":null,"avis":0,"statistique 4D 6 mois":400,"remarque":0}'::jsonb),
  ('MATRIX', 5, 'CARTON MATRIX 250', 'Matrix', '{"unite":null,"avis":null,"statistique 4D 6 mois":600,"remarque":null}'::jsonb),
  ('MATRIX', 6, 'CARTON SAVON MATRIX 70GRS', 'Matrix', '{"unite":null,"avis":null,"statistique 4D 6 mois":440,"remarque":null}'::jsonb),
  ('MATRIX', 7, 'CARTON LOTION 125 ML (VIERGE)', 'Matrix', '{"unite":null,"avis":0,"statistique 4D 6 mois":4000,"remarque":"5000cts / 24\ncts cre matrix 50g 9dz"}'::jsonb),
  ('MATRIX', 8, 'ETIQUETTE BAUME MATRIX 50 CORPS', 'Matrix', '{"unite":null,"avis":null,"statistique 4D 6 mois":0,"remarque":null}'::jsonb),
  ('MATRIX', 9, 'ETIQUETTE BAUME MATRIX 50 TETE', 'Matrix', '{"unite":null,"avis":null,"statistique 4D 6 mois":0,"remarque":null}'::jsonb),
  ('MATRIX', 10, 'ETIQUETTE CREME MATRIX 125ML', 'Matrix', '{"unite":null,"avis":null,"statistique 4D 6 mois":10000,"remarque":null}'::jsonb),
  ('MATRIX', 11, 'ETIQUETTE CREME MATRIX 250 ML', 'Matrix', '{"unite":null,"avis":null,"statistique 4D 6 mois":50000,"remarque":"800 /6DZ\n0 / 3DZ"}'::jsonb),
  ('MATRIX', 12, 'ETIQUETTE CREME MATRIX 50 ML', 'Matrix', '{"unite":null,"avis":null,"statistique 4D 6 mois":600000,"remarque":"2500 /18DZ\n3100 / 9DZ total 874800 pcs"}'::jsonb),
  ('MATRIX', 13, 'ETUIS SAVON MATRIX 2 IN 1 70 GM', 'Matrix', '{"unite":null,"avis":null,"statistique 4D 6 mois":0,"remarque":null}'::jsonb),
  ('MATRIX', 14, 'ETUIS TUBE MATRIX BAUME 15G', 'Matrix', '{"unite":null,"avis":null,"statistique 4D 6 mois":0,"remarque":null}'::jsonb),
  ('MATRIX', 15, 'ETUIS TUBE MATRIX BAUME 30G', 'Matrix', '{"unite":null,"avis":null,"statistique 4D 6 mois":0,"remarque":null}'::jsonb),
  ('MATRIX', 16, 'ETUIS TUBE MATRIX CREME 100G', 'Matrix', '{"unite":null,"avis":null,"statistique 4D 6 mois":36000,"remarque":null}'::jsonb),
  ('MATRIX', 17, 'TUBE VIDE BAUME MATRIX 15G D19', 'Matrix', '{"unite":null,"avis":null,"statistique 4D 6 mois":0,"remarque":null}'::jsonb),
  ('MATRIX', 18, 'TUBE VIDE BAUME MATRIX 30G D22', 'Matrix', '{"unite":null,"avis":null,"statistique 4D 6 mois":0,"remarque":null}'::jsonb),
  ('MATRIX', 19, 'TUBE VIDE CREME MATRIX 100G D35', 'Matrix', '{"unite":null,"avis":null,"statistique 4D 6 mois":36000,"remarque":null}'::jsonb),
  ('MATRIX', 20, 'CARTON BAUME DR JOHNSON 15G', 'Dr JONHSON', '{"unite":null,"avis":null,"statistique 4D 6 mois":0,"remarque":null}'::jsonb),
  ('MATRIX', 21, 'CARTON CREME DR JOHNSON 50', 'Dr JONHSON', '{"unite":"9dz","avis":0,"statistique 4D 6 mois":6000,"remarque":"8200  /25\n10000/24"}'::jsonb),
  ('MATRIX', 22, 'CARTON GEL DR JOHNSON 100G', 'Dr JONHSON', '{"unite":"12dz","avis":2000,"statistique 4D 6 mois":4000,"remarque":"4750  /25\n5900  /24"}'::jsonb),
  ('MATRIX', 23, 'CARTON GEL DR JOHNSON 15G', 'Dr JONHSON', '{"unite":"36dz","avis":null,"statistique 4D 6 mois":250,"remarque":"0      /25\n11    /24"}'::jsonb),
  ('MATRIX', 24, 'CARTON GEL DR JOHNSON 30G', 'Dr JONHSON', '{"unite":"24dz","avis":1000,"statistique 4D 6 mois":1000,"remarque":"190   /25\n500   /24"}'::jsonb),
  ('MATRIX', 25, 'CARTON SAVON DR JOHNSON 70GRS', 'Dr JONHSON', '{"unite":null,"avis":null,"statistique 4D 6 mois":0,"remarque":null}'::jsonb),
  ('MATRIX', 26, 'ETIQUETTE BAUME DR JOHNSON 10ML', 'Dr JONHSON', '{"unite":"3000 CTS","avis":null,"statistique 4D 6 mois":2160000,"remarque":null}'::jsonb),
  ('MATRIX', 27, 'ETIQUETTE CREME DR JOHNSON 50ML', 'Dr JONHSON', '{"unite":null,"avis":null,"statistique 4D 6 mois":648000,"remarque":null}'::jsonb),
  ('MATRIX', 28, 'ETIQUETTE TETE CREME DR JHONSON', 'Dr JONHSON', '{"unite":null,"avis":0,"statistique 4D 6 mois":756000,"remarque":null}'::jsonb),
  ('MATRIX', 29, 'ETUIS SAVON DR JHONSON 2 IN 1 70 GM', 'Dr JONHSON', '{"unite":null,"avis":null,"statistique 4D 6 mois":0,"remarque":null}'::jsonb),
  ('MATRIX', 30, 'ETUIS TUBE DR JOHNSON BAUME 15G', 'Dr JONHSON', '{"unite":null,"avis":null,"statistique 4D 6 mois":25000,"remarque":null}'::jsonb),
  ('MATRIX', 31, 'ETUIS TUBE DR JOHNSON GEL 100G', 'Dr JONHSON', '{"unite":null,"avis":null,"statistique 4D 6 mois":576000,"remarque":null}'::jsonb),
  ('MATRIX', 32, 'ETUIS TUBE DR JOHNSON GEL 15G', 'Dr JONHSON', '{"unite":null,"avis":null,"statistique 4D 6 mois":108000,"remarque":null}'::jsonb),
  ('MATRIX', 33, 'ETUIS TUBE DR JOHNSON GEL 30G', 'Dr JONHSON', '{"unite":null,"avis":null,"statistique 4D 6 mois":288000,"remarque":null}'::jsonb),
  ('MATRIX', 34, 'TUBE VIDE BAUME DR. JOHNSON 15G D19', 'Dr JONHSON', '{"unite":null,"avis":null,"statistique 4D 6 mois":25000,"remarque":null}'::jsonb),
  ('MATRIX', 35, 'TUBE VIDE GEL DR. JOHNSON 100G D35', 'Dr JONHSON', '{"unite":null,"avis":150000,"statistique 4D 6 mois":576000,"remarque":null}'::jsonb),
  ('MATRIX', 36, 'TUBE VIDE GEL DR. JOHNSON 15G D19', 'Dr JONHSON', '{"unite":null,"avis":null,"statistique 4D 6 mois":108000,"remarque":null}'::jsonb),
  ('MATRIX', 37, 'TUBE VIDE GEL DR. JOHNSON 30G D22', 'Dr JONHSON', '{"unite":null,"avis":null,"statistique 4D 6 mois":288000,"remarque":null}'::jsonb),
  ('MATRIX', 38, 'CARTON CREME RGL VIERGE', 'MENTHOLE', '{"unite":null,"avis":2000,"statistique 4D 6 mois":1500,"remarque":3500}'::jsonb),
  ('MATRIX', 39, 'ETIQUETTE POMMADE WHITE CAT CORPS RGL', 'MENTHOLE', '{"unite":null,"avis":null,"statistique 4D 6 mois":50000,"remarque":225}'::jsonb),
  ('MATRIX', 40, 'ETIQUETTE POMMADE WHITE CAT TETE RGL', 'MENTHOLE', '{"unite":null,"avis":null,"statistique 4D 6 mois":50000,"remarque":null}'::jsonb),
  ('MATRIX', 41, 'ETIQUETTE POMMADE MENTHOLATA RGL', 'MENTHOLE', '{"unite":null,"avis":null,"statistique 4D 6 mois":144000,"remarque":"1050 /25\n3000 /24"}'::jsonb),
  ('MATRIX', 42, 'ETIQUETTE POMMADE BLACK POWER 125GRS', 'MENTHOLE', '{"unite":null,"avis":null,"statistique 4D 6 mois":30000,"remarque":null}'::jsonb)
on conflict (gamme_statistique, ordre) do update set
  designation = excluded.designation,
  categorie = excluded.categorie,
  donnees = excluded.donnees;
