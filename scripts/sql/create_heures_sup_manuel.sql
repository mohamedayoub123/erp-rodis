-- Nouveau module "Heures Sup Manuel" (Production) : saisie manuelle d'heures
-- supplementaires pour des activites hors du suivi automatique Fabrication/
-- Conditionnement/Emballage (Sleevage, Impression, Recuperation...).
-- heures_sup_activites = liste geree/reutilisable (menu deroulant + "+ Nouvelle
-- activite" cote UI), plutot qu'un texte libre retape a chaque saisie.

create table heures_sup_activites (
  id bigint generated always as identity primary key,
  nom text not null unique,
  created_at timestamptz not null default now()
);

insert into heures_sup_activites (nom) values
  ('Sleevage'),
  ('Impression'),
  ('Recuperation');

create table heures_sup_manuel (
  id bigint generated always as identity primary key,
  date_jour date not null,
  activite_id bigint not null references heures_sup_activites(id),
  nb_journaliers numeric not null,
  nb_heures numeric not null,
  remarque text,
  cree_par text,
  created_at timestamptz not null default now()
);

create index on heures_sup_manuel (date_jour);
