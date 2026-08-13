-- Deconnexion forcee du compte "mayoub" (session active sur un autre
-- ordinateur inaccessible - la meme action que le bouton "Deconnecter" sur
-- la page Admin, execute directement car ce compte est aussi l'admin et
-- est bloque hors de l'app par sa propre session active ailleurs).
update public.stock_users
set active_session_token = null,
    session_started_at = null
where username = 'mayoub';
