-- Un meme numero de lot (code) peut se retrouver sur plusieurs
-- programme_ligne_id (redispatche vers une autre machine/chaine) - c'est
-- physiquement le meme lot, un seul vrai test labo. Le code applique
-- desormais ce principe pour toute nouvelle saisie (voir
-- saveTestLaboAction), mais les donnees deja existantes restent
-- desynchronisees tant que ce script n'a pas ete lance une fois.
--
-- Garde la saisie la plus RECENTE (date_saisie_test_labo) comme source de
-- verite pour chaque code, et l'applique a toutes les AUTRES lignes
-- production_rapports portant ce meme code - y compris celles ou aucun
-- test labo n'a encore ete saisi (elles doivent refleter le meme resultat,
-- pas rester vides).
begin;

with dernier_par_code as (
  select distinct on (code)
    code, ph, densite, viscosite, degre_alcool, stabilite, couleur,
    temperature_test, odeur, taux_humidite, pression_atmospherique, texture,
    remarque, disposition_qualite, sous_derogation, motif_derogation,
    date_prise_echantillon, heure_prise_echantillon, heure_debut_analyse,
    heure_fin_analyse, nom_labo, utilisateur_test_labo, date_saisie_test_labo
  from production_rapports
  where utilisateur_test_labo is not null
  order by code, date_saisie_test_labo desc nulls last
)
update production_rapports pr
set
  ph = d.ph,
  densite = d.densite,
  viscosite = d.viscosite,
  degre_alcool = d.degre_alcool,
  stabilite = d.stabilite,
  couleur = d.couleur,
  temperature_test = d.temperature_test,
  odeur = d.odeur,
  taux_humidite = d.taux_humidite,
  pression_atmospherique = d.pression_atmospherique,
  texture = d.texture,
  remarque = d.remarque,
  disposition_qualite = d.disposition_qualite,
  sous_derogation = d.sous_derogation,
  motif_derogation = d.motif_derogation,
  date_prise_echantillon = d.date_prise_echantillon,
  heure_prise_echantillon = d.heure_prise_echantillon,
  heure_debut_analyse = d.heure_debut_analyse,
  heure_fin_analyse = d.heure_fin_analyse,
  nom_labo = d.nom_labo,
  utilisateur_test_labo = d.utilisateur_test_labo,
  date_saisie_test_labo = d.date_saisie_test_labo
from dernier_par_code d
where pr.code = d.code
  and (
    pr.utilisateur_test_labo is distinct from d.utilisateur_test_labo
    or pr.date_saisie_test_labo is distinct from d.date_saisie_test_labo
  );

commit;
