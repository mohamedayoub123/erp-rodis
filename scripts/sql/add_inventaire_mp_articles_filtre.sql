-- Inventaire MP : possibilite de limiter une session a des ARTICLES precis (en plus des categories et gammes).
-- NULL ou tableau vide = pas de filtre sur l'article. Contient les id de articles_matiere_premiere choisis.
alter table public.inventaire_mp_sessions add column if not exists articles_filtre bigint[];
