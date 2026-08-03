-- La date choisie dans "Programme par ligne" doit se propager jusqu'au
-- Dispatcher (Ravitailleur par ligne) et a son historique PD, pour que
-- chaque ligne affiche sa vraie date au lieu d'un "DATE :" vide.
alter table public.programme_dispatcher_lignes
  add column if not exists date_jour date;

alter table public.programme_dispatcher_history
  add column if not exists date_jour date;
