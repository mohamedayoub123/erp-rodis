-- Import du rapport COLORANT COSMETIQUE (onboarding multi-gammes Statistique MP, lot 2).
-- 19 articles.
-- A executer dans Supabase SQL Editor (la table existe deja, creee pour MP COSM).

insert into public.rapport_gamme_statistique_mp
  (gamme_statistique, ordre, designation, categorie, donnees)
values
  ('COLORANT COSMETIQUE', 1, 'COLORANT BLEU SOLUBLE W6002 (SENSIENT)', null, '{"avis":null,"statistique 4D 6 Mois":16000,"UTILISATION":"edc ange bb bleu\nedc ange bb d''amour bleu\nparfum capital paris\nedc mamassita bleu\nparfum pure sensation\ngel douche soopure men\ngel douche coco clear\ngel douche precious perfect (cla;exf)\nsavon precious perfect"}'::jsonb),
  ('COLORANT COSMETIQUE', 2, 'COLORANT BRUN A EAU // NOUROU', null, '{"avis":null,"statistique 4D 6 Mois":500,"UTILISATION":"savon amalia gold\nsavon cocoa skin"}'::jsonb),
  ('COLORANT COSMETIQUE', 3, 'COLORANT BRUN SOLIDE W8008', null, '{"avis":null,"statistique 4D 6 Mois":1000,"UTILISATION":"edc soopure musck"}'::jsonb),
  ('COLORANT COSMETIQUE', 4, 'COLORANT CHOCOLAT A L''EAU COSM', null, '{"avis":null,"statistique 4D 6 Mois":1,"UTILISATION":null}'::jsonb),
  ('COLORANT COSMETIQUE', 5, 'COLORANT D&C YELLOW #5 (H-C)', null, '{"avis":null,"statistique 4D 6 Mois":1,"UTILISATION":null}'::jsonb),
  ('COLORANT COSMETIQUE', 6, 'COLORANT PASTE BLACK CI 77266', null, '{"avis":null,"statistique 4D 6 Mois":15000,"UTILISATION":"pommade black power"}'::jsonb),
  ('COLORANT COSMETIQUE', 8, 'COLORANT MARRON A EAU TG', null, '{"avis":null,"statistique 4D 6 Mois":1,"UTILISATION":"TEST GEL DOUCHE OU AUTRE"}'::jsonb),
  ('COLORANT COSMETIQUE', 9, 'COLORANT MARRON AU GRAS TG', null, '{"avis":null,"statistique 4D 6 Mois":1,"UTILISATION":"TEST GEL DOUCHE OU AUTRE"}'::jsonb),
  ('COLORANT COSMETIQUE', 10, 'COLORANT ORANGE SOLEIL 2002 COSM', null, '{"avis":null,"statistique 4D 6 Mois":10830,"UTILISATION":"creme,lait(skin light)"}'::jsonb),
  ('COLORANT COSMETIQUE', 11, 'COLORANT PHAT BROWN DC 8206', null, '{"avis":null,"statistique 4D 6 Mois":0,"UTILISATION":null}'::jsonb),
  ('COLORANT COSMETIQUE', 12, 'COLORANT ROUGE 33 (H-C)', null, '{"avis":null,"statistique 4D 6 Mois":1,"UTILISATION":null}'::jsonb),
  ('COLORANT COSMETIQUE', 13, 'COLORANT ROUGE A EAU // NOUROU / ROUGE A EAU TG', null, '{"avis":null,"statistique 4D 6 Mois":3000,"UTILISATION":"edc mamassita rose\nedc ange bb rose\nedc bb d''amour rose\nparfum excelence femme\nbody splash capital new york\nparfum pink flowers\nedc soopure lavande(bleu;rose)\nhuile elixir 90ml\nserum elixir\nparfum scandal femme\ngel douche soopure women\ngel douche soopure classic\ngel douche soopure rose\nsavon liquid soopure agrûme\ngel douche precious perfect clariffiant"}'::jsonb),
  ('COLORANT COSMETIQUE', 14, 'COLORANT ROUGE A EAU VIF W 3002 (sensient)', null, '{"avis":null,"statistique 4D 6 Mois":1,"UTILISATION":null}'::jsonb),
  ('COLORANT COSMETIQUE', 15, 'COLORANT ROUGE AU GRAS K7007 COSM', null, '{"avis":null,"statistique 4D 6 Mois":30000,"UTILISATION":"pommade coco butter\nbaume dr johnson rouge"}'::jsonb),
  ('COLORANT COSMETIQUE', 16, 'COLORANT ROUGE CERISE W 3007 (SENSIENT)', null, '{"avis":null,"statistique 4D 6 Mois":0,"UTILISATION":null}'::jsonb),
  ('COLORANT COSMETIQUE', 17, 'COLORANT ROUGE RUBIS W3004 (H-C)', null, '{"avis":null,"statistique 4D 6 Mois":1,"UTILISATION":"GEL DOUCHE OU DEMELANT/ SERUM"}'::jsonb),
  ('COLORANT COSMETIQUE', 18, 'COLORANT VEGET. CHARCOAL ( TOOTH )', null, '{"avis":null,"statistique 4D 6 Mois":1,"UTILISATION":"PATE DENTIFRICE "}'::jsonb),
  ('COLORANT COSMETIQUE', 19, 'COLORANT VERT A L''EAU K7157-J COSM', null, '{"avis":null,"statistique 4D 6 Mois":1270,"UTILISATION":"parfum capital london\nedc soopure vetiver\nedc ange bb vert\nedc bb d''amour vert\ngel douche soopure kid''s\ngel douche coco clear"}'::jsonb),
  ('COLORANT COSMETIQUE', 20, 'COLORANT VERT AU GRAS W 7212 COSM', null, '{"avis":null,"statistique 4D 6 Mois":7000,"UTILISATION":"baume dr johnson vert"}'::jsonb)
on conflict (gamme_statistique, ordre) do update set
  designation = excluded.designation,
  categorie = excluded.categorie,
  donnees = excluded.donnees;
