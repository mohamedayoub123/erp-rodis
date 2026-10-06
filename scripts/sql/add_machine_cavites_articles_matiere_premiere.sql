-- Colonnes "Machine" et "Cavites" sur Statistique Article Plastique (E3) :
-- remplies a la main par article. Machine = nom de la machine sur laquelle
-- l'article travaille (vide = ne travaille pas sur une machine) ; cavites =
-- nombre de cavites du moule.
alter table public.articles_matiere_premiere
  add column if not exists machine_plastique text,
  add column if not exists nb_cavites integer;
