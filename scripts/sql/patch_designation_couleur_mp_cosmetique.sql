-- Ajoute la couleur de fond de la cellule DESIGNATION (colonne B) au fichier
-- Excel source, pour 19 articles - couleur manuelle (pas de formule),
-- copiee telle quelle depuis le fichier. Legende (voir bloc Notes en bas de
-- la page) : 00B050 = "Urgent : verifier la date sur le dossier..." (vert),
-- FFFF00 = "Urgent mettre pression sur rimex..." (jaune).

update public.rapport_gamme_statistique_mp set donnees = jsonb_set(donnees, '{designation_couleur}', '"00B050"'::jsonb) where gamme_statistique = 'MP COSM' and ordre = 4;
update public.rapport_gamme_statistique_mp set donnees = jsonb_set(donnees, '{designation_couleur}', '"00B050"'::jsonb) where gamme_statistique = 'MP COSM' and ordre = 9;
update public.rapport_gamme_statistique_mp set donnees = jsonb_set(donnees, '{designation_couleur}', '"00B050"'::jsonb) where gamme_statistique = 'MP COSM' and ordre = 11;
update public.rapport_gamme_statistique_mp set donnees = jsonb_set(donnees, '{designation_couleur}', '"00B050"'::jsonb) where gamme_statistique = 'MP COSM' and ordre = 19;
update public.rapport_gamme_statistique_mp set donnees = jsonb_set(donnees, '{designation_couleur}', '"00B050"'::jsonb) where gamme_statistique = 'MP COSM' and ordre = 20;
update public.rapport_gamme_statistique_mp set donnees = jsonb_set(donnees, '{designation_couleur}', '"00B050"'::jsonb) where gamme_statistique = 'MP COSM' and ordre = 22;
update public.rapport_gamme_statistique_mp set donnees = jsonb_set(donnees, '{designation_couleur}', '"00B050"'::jsonb) where gamme_statistique = 'MP COSM' and ordre = 23;
update public.rapport_gamme_statistique_mp set donnees = jsonb_set(donnees, '{designation_couleur}', '"00B050"'::jsonb) where gamme_statistique = 'MP COSM' and ordre = 25;
update public.rapport_gamme_statistique_mp set donnees = jsonb_set(donnees, '{designation_couleur}', '"00B050"'::jsonb) where gamme_statistique = 'MP COSM' and ordre = 27;
update public.rapport_gamme_statistique_mp set donnees = jsonb_set(donnees, '{designation_couleur}', '"00B050"'::jsonb) where gamme_statistique = 'MP COSM' and ordre = 28;
update public.rapport_gamme_statistique_mp set donnees = jsonb_set(donnees, '{designation_couleur}', '"00B050"'::jsonb) where gamme_statistique = 'MP COSM' and ordre = 34;
update public.rapport_gamme_statistique_mp set donnees = jsonb_set(donnees, '{designation_couleur}', '"00B050"'::jsonb) where gamme_statistique = 'MP COSM' and ordre = 35;
update public.rapport_gamme_statistique_mp set donnees = jsonb_set(donnees, '{designation_couleur}', '"FFFF00"'::jsonb) where gamme_statistique = 'MP COSM' and ordre = 36;
update public.rapport_gamme_statistique_mp set donnees = jsonb_set(donnees, '{designation_couleur}', '"00B050"'::jsonb) where gamme_statistique = 'MP COSM' and ordre = 38;
update public.rapport_gamme_statistique_mp set donnees = jsonb_set(donnees, '{designation_couleur}', '"00B050"'::jsonb) where gamme_statistique = 'MP COSM' and ordre = 42;
update public.rapport_gamme_statistique_mp set donnees = jsonb_set(donnees, '{designation_couleur}', '"00B050"'::jsonb) where gamme_statistique = 'MP COSM' and ordre = 43;
update public.rapport_gamme_statistique_mp set donnees = jsonb_set(donnees, '{designation_couleur}', '"FFFF00"'::jsonb) where gamme_statistique = 'MP COSM' and ordre = 44;
update public.rapport_gamme_statistique_mp set donnees = jsonb_set(donnees, '{designation_couleur}', '"00B050"'::jsonb) where gamme_statistique = 'MP COSM' and ordre = 47;
update public.rapport_gamme_statistique_mp set donnees = jsonb_set(donnees, '{designation_couleur}', '"FFFF00"'::jsonb) where gamme_statistique = 'MP COSM' and ordre = 51;
