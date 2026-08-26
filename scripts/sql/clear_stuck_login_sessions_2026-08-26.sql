-- Deconnexion des comptes coinces par le bug staleTimes (login qui semblait
-- ne rien faire, chaque nouvelle tentative bloquee par la session tout
-- juste creee par la tentative precedente) - m.mteirek et claudetest
-- (compte de test cree pendant le diagnostic) ont chacun une session
-- "active" qui n'est en realite qu'un reste de ce bug, pas un vrai poste
-- encore ouvert.
--
-- Les autres comptes actuellement actifs (mayoub, ayoub, vincent, david,
-- lidya, mousa, aziz, achile, ismail) ont des sessions demarrees BIEN avant
-- ce bug (dans la matinee/debut d'apres-midi) - ce sont de vraies sessions
-- de travail en cours, volontairement non touchees ici.

update stock_users
set active_session_token = null,
    session_started_at = null
where username in ('m.mteirek', 'claudetest')
  and active_session_token is not null;
