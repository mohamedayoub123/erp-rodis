-- Import du rapport ELIXIR (fichier "6 INV ELIXIR.xlsx" fourni par
-- l'utilisateur) - 49 articles (47 numerotes + 2 sans numero ORDRE
-- dans le fichier source, renumerotes 48/49 pour ne pas les perdre). A
-- executer dans Supabase SQL Editor (la table existe deja, creee pour
-- MP COSM).

insert into public.rapport_gamme_statistique_mp
  (gamme_statistique, ordre, designation, categorie, donnees)
values
  ('ELIXIR', 1, 'BASE SAV 41433', null, '{"2025":2000,"avis":300,"statistique 4D 6mois":1500,"unite":"NP"}'::jsonb),
  ('ELIXIR', 2, 'BASE ALD 22307', null, '{"2025":6500,"avis":200,"statistique 4D 6mois":4000,"unite":"NP"}'::jsonb),
  ('ELIXIR', 3, 'CARTON CREME ELIXIR 220ML', null, '{"2025":4800,"avis":null,"statistique 4D 6mois":4000,"unite":"4dz"}'::jsonb),
  ('ELIXIR', 4, 'CARTON CREME ELIXIR 400ML', null, '{"2025":5000,"avis":null,"statistique 4D 6mois":4000,"unite":"2dz"}'::jsonb),
  ('ELIXIR', 5, 'CARTON DSR ELIXIR 30ML', null, '{"2025":22000,"avis":0,"statistique 4D 6mois":15000,"unite":"6dz"}'::jsonb),
  ('ELIXIR', 48, 'CARTON GEL DOUCHE ELIXIR 1000ML', null, '{"2025":null,"avis":null,"statistique 4D 6mois":7000,"unite":"1dz"}'::jsonb),
  ('ELIXIR', 49, 'CARTON GEL DOUCHE ELIXIR 500ML', null, '{"2025":null,"avis":null,"statistique 4D 6mois":7000,"unite":"2dz"}'::jsonb),
  ('ELIXIR', 6, 'CARTON GEL DOUCHE ELIXIR CLARF. 1000ML', null, '{"2025":11200,"avis":null,"statistique 4D 6mois":8000,"unite":"1dz"}'::jsonb),
  ('ELIXIR', 7, 'CARTON GEL DOUCHE ELIXIR CLARF. 500ML', null, '{"2025":11600,"avis":null,"statistique 4D 6mois":8000,"unite":"2dz","designation_couleur":"FFFF00"}'::jsonb),
  ('ELIXIR', 8, 'CARTON GEL DOUCHE ELIXIR EXFO. 1000ML', null, '{"2025":5600,"avis":null,"statistique 4D 6mois":4000,"unite":"1dz"}'::jsonb),
  ('ELIXIR', 9, 'CARTON GEL DOUCHE ELIXIR EXFO. 500ML', null, '{"2025":6500,"avis":null,"statistique 4D 6mois":4000,"unite":"2dz","designation_couleur":"FFFF00"}'::jsonb),
  ('ELIXIR', 10, 'CARTON HUILE ELIXIR 90ML', null, '{"2025":3050,"avis":null,"statistique 4D 6mois":3000,"unite":"4dz"}'::jsonb),
  ('ELIXIR', 11, 'CARTON LAIT ELIXIR 250ML', null, '{"2025":28500,"avis":null,"statistique 4D 6mois":18000,"unite":"3dz"}'::jsonb),
  ('ELIXIR', 12, 'CARTON LAIT ELIXIR 500ML', null, '{"2025":17800,"avis":4000,"statistique 4D 6mois":15000,"unite":"2dz"}'::jsonb),
  ('ELIXIR', 13, 'CARTON SAVON ELIXIR 200GR', null, '{"2025":5500,"avis":null,"statistique 4D 6mois":4000,"unite":"4dz"}'::jsonb),
  ('ELIXIR', 14, 'CARTON SCRUB ELIXIR 400ML', null, '{"2025":null,"avis":null,"statistique 4D 6mois":3000,"unite":"3dz"}'::jsonb),
  ('ELIXIR', 15, 'CARTON TUBE CREME ELIXIR 70GR', null, '{"2025":600,"avis":null,"statistique 4D 6mois":1000,"unite":"6dz"}'::jsonb),
  ('ELIXIR', 16, 'CARTON SERUM ELIXIR 30ML', null, '{"2025":1900,"avis":null,"statistique 4D 6mois":2000,"unite":"4dz"}'::jsonb),
  ('ELIXIR', 17, 'DISPLAY BOX CREME ELIXIR 220ML', null, '{"2025":null,"avis":0,"statistique 4D 6mois":24000,"unite":"6/CTS"}'::jsonb),
  ('ELIXIR', 18, 'DISPLAY BOX CREME ELIXIR 400ML', null, '{"2025":null,"avis":0,"statistique 4D 6mois":16000,"unite":"4/CTS","designation_couleur":"FFFF00"}'::jsonb),
  ('ELIXIR', 19, 'DISPLAY BOX LAIT ELIXIR 250ML', null, '{"2025":null,"avis":null,"statistique 4D 6mois":108000,"unite":"6/CTS"}'::jsonb),
  ('ELIXIR', 20, 'DISPLAY BOX LAIT ELIXIR 500ML', null, '{"2025":null,"avis":null,"statistique 4D 6mois":90000,"unite":"4/CTS"}'::jsonb),
  ('ELIXIR', 21, 'DISPLAY BOX SCRUB ELIXIR 400ML', null, '{"2025":null,"avis":null,"statistique 4D 6mois":18000,"unite":"6/CTS"}'::jsonb),
  ('ELIXIR', 22, 'ETIQUETTE GEL DOUCHE ELIXIR 1L (BACK)', null, '{"2025":null,"avis":null,"statistique 4D 6mois":96000}'::jsonb),
  ('ELIXIR', 23, 'ETIQUETTE GEL DOUCHE ELIXIR 1L (FRONT)', null, '{"2025":null,"avis":null,"statistique 4D 6mois":96000}'::jsonb),
  ('ELIXIR', 24, 'ETIQUETTE GEL DOUCHE ELIXIR EXFL. 1L ( FRONT)', null, '{"2025":null,"avis":null,"statistique 4D 6mois":48000}'::jsonb),
  ('ELIXIR', 25, 'ETIQUETTE GEL DOUCHE ELIXIR EXFL. 1L (BACK)', null, '{"2025":null,"avis":null,"statistique 4D 6mois":48000}'::jsonb),
  ('ELIXIR', 26, 'ETIQUETTE GEL DOUCHE ELIXIR 500ML (BACK)', null, '{"2025":null,"avis":50000,"statistique 4D 6mois":192000}'::jsonb),
  ('ELIXIR', 27, 'ETIQUETTE GEL DOUCHE ELIXIR 500ML (FRONT)', null, '{"2025":null,"avis":40000,"statistique 4D 6mois":192000}'::jsonb),
  ('ELIXIR', 28, 'ETIQUETTE GEL DOUCHE ELIXIR EXFL. 500ML (BACK)', null, '{"2025":null,"avis":40000,"statistique 4D 6mois":96000}'::jsonb),
  ('ELIXIR', 29, 'ETIQUETTE GEL DOUCHE ELIXIR EXFL. 500ML (FRONT)', null, '{"2025":null,"avis":30000,"statistique 4D 6mois":96000}'::jsonb),
  ('ELIXIR', 30, 'ETUIS DSR ELIXIR LIGHT 30 ML', null, '{"2025":null,"avis":null,"statistique 4D 6mois":1080000}'::jsonb),
  ('ELIXIR', 31, 'ETUIS DISPLAY ELIXIR LIGHT DSR 12*30ML', null, '{"2025":null,"avis":null,"statistique 4D 6mois":90000}'::jsonb),
  ('ELIXIR', 32, 'ETUIS DISPLAY ELIXIR HUILE 12*90ML', null, '{"2025":null,"avis":null,"statistique 4D 6mois":12000}'::jsonb),
  ('ELIXIR', 33, 'ETUIS DISPLAY ELIXIR SERUM 12*30ML', null, '{"2025":null,"avis":null,"statistique 4D 6mois":8000}'::jsonb),
  ('ELIXIR', 34, 'ETUIS SAVON ELIXIR LIGHT 200 GR', null, '{"2025":null,"avis":null,"statistique 4D 6mois":192000}'::jsonb),
  ('ELIXIR', 35, 'ETUIS TUBE CREME ELIXIR LIGHT 70GR', null, '{"2025":null,"avis":null,"statistique 4D 6mois":72000}'::jsonb),
  ('ELIXIR', 36, 'TUBE VIDE CREME ELIXIR 70GR', null, '{"2025":null,"avis":null,"statistique 4D 6mois":72000}'::jsonb),
  ('ELIXIR', 37, 'GLASS BOTTLE SERUM ELIXIR PRINT', null, '{"2025":null,"avis":null,"statistique 4D 6mois":96000}'::jsonb),
  ('ELIXIR', 38, 'PIPETTE SERUM 18/410 GOLD', null, '{"2025":null,"avis":null,"statistique 4D 6mois":null}'::jsonb),
  ('ELIXIR', 39, 'SLEEVE CREME ELIXIR 220ML', null, '{"2025":null,"avis":null,"statistique 4D 6mois":192000}'::jsonb),
  ('ELIXIR', 40, 'SLEEVE CREME ELIXIR 400ML', null, '{"2025":null,"avis":null,"statistique 4D 6mois":96000}'::jsonb),
  ('ELIXIR', 41, 'SLEEVE DSR ELIXIR 30ML', null, '{"2025":null,"avis":null,"statistique 4D 6mois":1080000}'::jsonb),
  ('ELIXIR', 42, 'SLEEVE HUILE ELIXIR 90ML', null, '{"2025":null,"avis":null,"statistique 4D 6mois":144000}'::jsonb),
  ('ELIXIR', 43, 'SLEEVE LAIT ELIXIR 250ML', null, '{"2025":null,"avis":null,"statistique 4D 6mois":648000}'::jsonb),
  ('ELIXIR', 44, 'SLEEVE LAIT ELIXIR 500ML', null, '{"2025":null,"avis":null,"statistique 4D 6mois":360000}'::jsonb),
  ('ELIXIR', 45, 'SLEEVE SCRUB ELIXIR 400ML', null, '{"2025":null,"avis":null,"statistique 4D 6mois":108000}'::jsonb),
  ('ELIXIR', 46, '28/410 SCREW LOTION PUMP MILK PINK 7430C-253 MM', null, '{"2025":null,"avis":null,"statistique 4D 6mois":96000}'::jsonb),
  ('ELIXIR', 47, '28/410 SCREW LOTION PUMP MILK PINK 7430C-206MM', null, '{"2025":null,"avis":null,"statistique 4D 6mois":192000,"designation_couleur":"FFFF00"}'::jsonb)
on conflict (gamme_statistique, ordre) do update set
  designation = excluded.designation,
  categorie = excluded.categorie,
  donnees = excluded.donnees;
