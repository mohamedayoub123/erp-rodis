-- Module Facturation (Proforma -> BL -> Facture), branche dev/V2.
-- Colle ce script dans le SQL editor du projet Supabase "erp rodis dev"
-- (pas le projet production "erp rodis").

create table if not exists bons_livraison (
  id bigint generated always as identity primary key,
  numero int not null,
  date_jour date not null,
  commande_id bigint not null references commandes(id),
  remarque text,
  cree_par text,
  created_at timestamptz not null default now()
);

-- 1 BL par commande (les commandes multi-camion sont deja des lignes
-- separees dans "commandes", chacune a droit a son propre BL).
create unique index if not exists bons_livraison_commande_id_key on bons_livraison (commande_id);

create table if not exists bon_livraison_lignes (
  id bigint generated always as identity primary key,
  bon_livraison_id bigint not null references bons_livraison(id) on delete cascade,
  article_id bigint not null,
  numero_lot text,
  quantite numeric not null
);

create table if not exists factures (
  id bigint generated always as identity primary key,
  numero int not null,
  date_jour date not null,
  bon_livraison_id bigint not null references bons_livraison(id),
  montant numeric,
  remarque text,
  cree_par text,
  created_at timestamptz not null default now()
);

-- 1 Facture par BL.
create unique index if not exists factures_bon_livraison_id_key on factures (bon_livraison_id);
