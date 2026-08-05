-- "programme_lignes" a deja une colonne cree_par (jamais peuplee jusqu'ici) ;
-- "programme_dispatcher_history" n'en a pas du tout - ajoutee ici pour
-- pouvoir afficher/filtrer "cree par qui" dans Historique programme et
-- Historique Programme Dispatcher.
alter table public.programme_dispatcher_history
  add column if not exists cree_par text;
