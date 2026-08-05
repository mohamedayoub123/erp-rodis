-- Empeche le meme utilisateur (hors admin mayoub) d'etre connecte sur 2
-- ordinateurs en meme temps, et permet a Admin de voir qui est connecte.
--
-- active_session_token : jeton du login le plus recent pour ce compte. Le
-- cookie du navigateur transporte ce meme jeton signe ; s'ils ne
-- correspondent plus (un autre login a eu lieu ailleurs, ou l'admin a force
-- la deconnexion), la session en cours est traitee comme deconnectee.
-- session_started_at : heure de ce login, sert a la fois a afficher "connecte
-- depuis" dans Admin et a expirer automatiquement une session bloquee
-- (meme duree que le cookie, 12h) sans intervention si quelqu'un ferme son
-- navigateur sans cliquer sur Deconnexion.
alter table public.stock_users
  add column if not exists active_session_token text,
  add column if not exists session_started_at timestamptz;
