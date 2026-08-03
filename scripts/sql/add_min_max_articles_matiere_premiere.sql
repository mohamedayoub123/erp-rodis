-- Run this once in the Supabase SQL Editor (Dashboard > SQL Editor > New query).
-- Ajoute les seuils min/max sur les articles matiere premiere, meme
-- principe que articles.min_stock/max_stock (PF).

alter table public.articles_matiere_premiere add column if not exists min_stock numeric;
alter table public.articles_matiere_premiere add column if not exists max_stock numeric;
