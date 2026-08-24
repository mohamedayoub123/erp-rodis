-- Module Facturation (Commande -> BL -> Apurement -> FIFO -> Livraison -> Facture),
-- branche dev/V2. Colle ce script dans le SQL editor du projet Supabase
-- "erp rodis dev" (pas le projet production "erp rodis").
--
-- Remplace le premier jet (Proforma reprenait "commandes" existant) : le
-- module est maintenant totalement independant de "commandes" - sa propre
-- saisie de commande, son propre cycle BL -> apurement -> FIFO -> livraison
-- (le stock ne sort reellement qu'a la livraison) -> facture.

drop table if exists factures;
drop table if exists bl_fifo_resultats;
drop table if exists bon_livraison_lignes;
drop table if exists bons_livraison;
drop table if exists facturation_commande_lignes;
drop table if exists facturation_commandes;

create table facturation_commandes (
  id bigint generated always as identity primary key,
  numero int not null,
  date_jour date not null,
  client text not null,
  depot_source_id bigint not null references depots(id),
  remarque text,
  cree_par text,
  created_at timestamptz not null default now()
);

create table facturation_commande_lignes (
  id bigint generated always as identity primary key,
  commande_id bigint not null references facturation_commandes(id) on delete cascade,
  article_id bigint not null,
  quantite_demandee numeric not null
);

create table bons_livraison (
  id bigint generated always as identity primary key,
  numero int not null,
  date_jour date not null,
  commande_id bigint not null references facturation_commandes(id),
  statut text not null default 'brouillon', -- brouillon -> apure -> fifo_fait -> livree
  remarque text,
  cree_par text,
  created_at timestamptz not null default now()
);

-- 1 BL par commande.
create unique index bons_livraison_commande_id_key on bons_livraison (commande_id);

create table bon_livraison_lignes (
  id bigint generated always as identity primary key,
  bon_livraison_id bigint not null references bons_livraison(id) on delete cascade,
  article_id bigint not null,
  quantite_demandee numeric not null
);

-- Resultat du dispatch FIFO (etape "FIFO") : quel(s) lot(s) precis
-- couvrent chaque ligne du BL - calcule automatiquement (FEFO), rempli
-- seulement apres "Apurer". Le stock ne bouge PAS encore a cette etape,
-- seulement a la Livraison (voir bon_livraison_lignes vs cette table).
create table bl_fifo_resultats (
  id bigint generated always as identity primary key,
  bon_livraison_id bigint not null references bons_livraison(id) on delete cascade,
  bon_livraison_ligne_id bigint not null references bon_livraison_lignes(id) on delete cascade,
  article_id bigint not null,
  numero_lot text,
  quantite_chargee numeric not null
);

create table factures (
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
create unique index factures_bon_livraison_id_key on factures (bon_livraison_id);
