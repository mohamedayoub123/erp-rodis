-- Inventaire MP : une session peut desormais etre limitee a une ou
-- plusieurs categories d'articles (POTS, CAPSULES, BASE, mp cosm...) au
-- lieu de toujours couvrir tout le MP - demande explicite : pouvoir lancer
-- PLUSIEURS inventaires EN MEME TEMPS, chacun sur ses propres categories
-- choisies a la main (ex: un inventaire "MP/BASE", un autre "conditionnement
-- plastique", un autre "conditionnement cosmetique"). NULL ou tableau vide
-- = pas de filtre, comme avant (tout le MP).
alter table public.inventaire_mp_sessions add column if not exists categories_filtre text[];
