-- Suivi des commandes matiere premiere (achat/reception), independant des
-- commandes clients (table "commandes" existante, cote vente).
create table if not exists public.commandes_matiere_premiere (
  id bigint generated always as identity primary key,
  n_doss_4d text,
  n_doss_erp text,
  date_commande date,
  fournisseur text,
  statut text not null default 'Commande',
  created_at timestamptz not null default now()
);

create index if not exists commandes_matiere_premiere_statut_idx
  on public.commandes_matiere_premiere (statut);
