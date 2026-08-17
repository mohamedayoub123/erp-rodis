-- Prix au litre (gaz/essence/gasoil), saisis par mois - permet de calculer
-- automatiquement le cout a partir de la consommation en litres saisie
-- dans charges_usine (meme mois). A executer dans Supabase Dashboard >
-- SQL Editor.
create table if not exists public.prix_carburant (
  id bigserial primary key,
  annee int not null,
  mois int not null check (mois between 1 and 12),
  prix_gaz numeric,
  prix_essence numeric,
  prix_gasoil numeric,
  utilisateur text,
  date_saisie timestamptz not null default now(),
  unique (annee, mois)
);

create index if not exists prix_carburant_annee_mois_idx on public.prix_carburant (annee desc, mois desc);
