-- Le changement de format du cookie de session (correctif du bug
-- "m.mteirek") rend illisibles TOUS les anciens cookies deja en place -
-- chaque utilisateur deja connecte apparait donc deconnecte, MAIS sa ligne
-- stock_users garde encore son ancienne session "active" (jamais nettoyee,
-- juste devenue illisible), ce qui bloque sa reconnexion avec "deja
-- connecte". Ce script libere tout le monde d'un coup pour que chacun
-- puisse se reconnecter normalement avec le nouveau format.

update stock_users
set active_session_token = null,
    session_started_at = null
where active_session_token is not null;
