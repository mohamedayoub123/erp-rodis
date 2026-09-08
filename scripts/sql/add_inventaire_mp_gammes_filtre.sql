-- Inventaire MP : filtre de session egalement par gamme (pas seulement par
-- categorie) - demande explicite. NULL ou tableau vide = pas de filtre sur
-- la gamme (comme categories_filtre).
alter table public.inventaire_mp_sessions add column if not exists gammes_filtre text[];
