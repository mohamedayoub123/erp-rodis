-- Bons de commande (BC) matiere premiere : article + quantite demandee,
-- suivi par un code auto-genere (BC1, BC2...) - distinct de la page Import
-- (commandes_matiere_premiere) qui suit le dossier/fournisseur sans le
-- detail article/quantite.
create table if not exists public.bons_commande_matiere_premiere (
  id bigint generated always as identity primary key,
  code text not null,
  article_id bigint references public.articles_matiere_premiere(id),
  article_label text,
  quantite numeric,
  n_doss_4d text,
  n_doss_erp text,
  statut text not null default 'Stand',
  date_jour date not null default current_date,
  created_at timestamptz not null default now()
);

create index if not exists bons_commande_mp_statut_idx
  on public.bons_commande_matiere_premiere (statut);
