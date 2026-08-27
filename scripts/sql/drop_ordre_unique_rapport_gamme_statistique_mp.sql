-- Le numero ORDRE d'un rapport de gamme (rapport_gamme_statistique_mp)
-- devient modifiable depuis l'appli (voir rapport-table.tsx) : deplacer une
-- ligne vers un numero deja utilise par une ou plusieurs autres lignes doit
-- etre permis - la ligne deplacee vient alors juste se placer apres les
-- lignes existantes sur ce numero (triees par id), demande explicite de
-- l'utilisateur. La contrainte d'unicite (gamme_statistique, ordre),
-- ajoutee au depart comme garde-fou anti-doublon a l'import, l'empeche.
alter table public.rapport_gamme_statistique_mp
  drop constraint if exists rapport_gamme_statistique_mp_unique;
