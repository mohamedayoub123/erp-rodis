-- Import du rapport MP PLASTIQUE (onboarding multi-gammes Statistique MP, lot 2).
-- 16 articles.
-- A executer dans Supabase SQL Editor (la table existe deja, creee pour MP COSM).

insert into public.rapport_gamme_statistique_mp
  (gamme_statistique, ordre, designation, categorie, donnees)
values
  ('MP PLASTIQUE', 1, 'HDPE SOUFLAGE', null, '{"fournisseur":null,"avis":null,"statistique 4D":180000,"statistique 6mois calculé":278502.5,"CONSO 2025":327650,"utilisation":"POT + FLC ECO FAMILY+ POT (KINDER+VATIKA+MOROCO EGYPTIAN ) + FLC SKL","QUANTITE TC":24750,"col_R_unlabeled":3735}'::jsonb),
  ('MP PLASTIQUE', 2, 'PP HOMO', null, '{"fournisseur":null,"avis":null,"statistique 4D":10000,"statistique 6mois calculé":4016.25,"CONSO 2025":4725,"utilisation":"SEAU 10L TRSP / CSPL KINDER SI RUPTUR RANDOM INJECTION","QUANTITE TC":24750,"col_R_unlabeled":229075}'::jsonb),
  ('MP PLASTIQUE', 3, 'PP RANDOM INJECTION', null, '{"fournisseur":null,"avis":null,"statistique 4D":350000,"statistique 6mois calculé":493255,"CONSO 2025":580300,"utilisation":"CAPSUL FT + AUTRE : KINDER /SAFI / ELIXIR ABSOLUT / POT TRANSPARENT RGL, STD, GT VITFEE / POT DR JOHNSON","QUANTITE TC":"24750 / 16000","col_R_unlabeled":null}'::jsonb),
  ('MP PLASTIQUE', 4, 'PP RANDOM SOUFLAGE', null, '{"fournisseur":"BOROUGE","avis":0,"statistique 4D":50000,"statistique 6mois calculé":23,"CONSO 2025":728175,"utilisation":"MAPER  / FLC KINDER +FLC PP+FLC ELIXIR+POT CV","QUANTITE TC":16000,"col_R_unlabeled":75}'::jsonb),
  ('MP PLASTIQUE', 5, 'PP RANDOM SOUFLAGE', null, '{"fournisseur":"LOTTE SB R520Y","avis":null,"statistique 4D":400000,"statistique 6mois calculé":618948.75,"CONSO 2025":null,"utilisation":"IBM + MAPER / FLC +POT KINDER + AUTRES ","QUANTITE TC":16000,"col_R_unlabeled":2504,"designation_couleur":"00B050"}'::jsonb),
  ('MP PLASTIQUE', 6, 'RESINE PET RELIANCE RELPET G5801 - IV 0,80 CR8816', null, '{"fournisseur":"CHINA RESSOURCE CR8816 CHINE ","avis":null,"statistique 4D":300000,"statistique 6mois calculé":498355,"CONSO 2025":586300,"utilisation":null,"QUANTITE TC":22000,"col_R_unlabeled":null}'::jsonb),
  ('MP PLASTIQUE', 7, 'RESINE PET RELIANCE RELPET G5841 - IV 0,85', null, '{"fournisseur":"RELIANCE RELPET G5841 - IV 0,85 HINDIA","avis":null,"statistique 4D":0,"statistique 6mois calculé":0,"CONSO 2025":null,"utilisation":"DECHET :                              HINDIA  10%                                                    CHINE    25%","QUANTITE TC":23000,"col_R_unlabeled":14675}'::jsonb),
  ('MP PLASTIQUE', 8, 'PP COPO MFI 40 - 45', null, '{"fournisseur":null,"avis":0,"statistique 4D":90000,"statistique 6mois calculé":15,"CONSO 2025":"2025 / 168750   2024  /   212000","utilisation":"POT +CAPSUL ( SKIN LIGHT MATRIX) ,capsul ecofamily ofa , capsul cœur de vaseline","QUANTITE TC":24750,"col_R_unlabeled":null}'::jsonb),
  ('MP PLASTIQUE', 9, 'HDPE INJECTION', null, '{"fournisseur":null,"avis":null,"statistique 4D":15000,"statistique 6mois calculé":20973.75,"CONSO 2025":24675,"utilisation":"TOPETTE  /  POT DSR ANCIEN MOUL","QUANTITE TC":24750,"col_R_unlabeled":357625}'::jsonb),
  ('MP PLASTIQUE', 10, 'LDPE', null, '{"fournisseur":null,"avis":null,"statistique 4D":0,"statistique 6mois calculé":0,"CONSO 2025":0,"utilisation":null,"QUANTITE TC":null,"col_R_unlabeled":0}'::jsonb),
  ('MP PLASTIQUE', 11, 'LLDPE', null, '{"fournisseur":null,"avis":null,"statistique 4D":2500,"statistique 6mois calculé":0,"CONSO 2025":0,"utilisation":"CHAISE 2%","QUANTITE TC":null,"col_R_unlabeled":526765}'::jsonb),
  ('MP PLASTIQUE', 12, 'PP CARICATO CARB BLANC', null, '{"fournisseur":null,"avis":null,"statistique 4D":500,"statistique 6mois calculé":29.75,"CONSO 2025":35,"utilisation":"POT DR JOHNSON 2%","QUANTITE TC":null,"col_R_unlabeled":37400}'::jsonb),
  ('MP PLASTIQUE', 13, 'PP CARICATO CARB NEUTRE', null, '{"fournisseur":null,"avis":null,"statistique 4D":500,"statistique 6mois calculé":0,"CONSO 2025":0,"utilisation":null,"QUANTITE TC":null,"col_R_unlabeled":211950}'::jsonb),
  ('MP PLASTIQUE', 14, 'PP HOMO CH', null, '{"fournisseur":null,"avis":null,"statistique 4D":0,"statistique 6mois calculé":0,"CONSO 2025":0,"utilisation":null,"QUANTITE TC":null,"col_R_unlabeled":6150}'::jsonb),
  ('MP PLASTIQUE', 15, 'PP COPO MFI 16 - 20', null, '{"fournisseur":null,"avis":null,"statistique 4D":30000,"statistique 6mois calculé":1870,"CONSO 2025":2200,"utilisation":"CHAISE","QUANTITE TC":24750,"col_R_unlabeled":null}'::jsonb),
  ('MP PLASTIQUE', 16, 'PP COPO MFI 19', null, '{"fournisseur":null,"avis":null,"statistique 4D":null,"statistique 6mois calculé":null,"CONSO 2025":null,"utilisation":"POUR LE SEAU BLANC","QUANTITE TC":null,"col_R_unlabeled":155775}'::jsonb)
on conflict (gamme_statistique, ordre) do update set
  designation = excluded.designation,
  categorie = excluded.categorie,
  donnees = excluded.donnees;
