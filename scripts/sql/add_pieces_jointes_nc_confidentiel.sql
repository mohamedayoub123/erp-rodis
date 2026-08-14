-- A coller dans Supabase Dashboard > SQL Editor > New query.
-- Pieces jointes (photos/fichiers) sur NC Confidentiel, attachees a la
-- colonne N. Stockees dans un bucket Storage prive (jamais public - acces
-- uniquement via URL signee generee cote serveur, apres verification de
-- la permission sur la page).

alter table public.qualite_nc_confidentiel
  add column if not exists pieces_jointes jsonb not null default '[]'::jsonb;

insert into storage.buckets (id, name, public)
values ('qualite-audit-fichiers', 'qualite-audit-fichiers', false)
on conflict (id) do nothing;
