-- Suivi des paiements clients recus sur une commande - permet au compte
-- 411000 (Clients) de redescendre a 0 quand le client paie, au lieu de
-- rester bloque a la valeur cumulee de toutes les ventes pour toujours
-- (aucun mecanisme de paiement n'existait avant ceci).
create table if not exists commande_paiements (
  id bigserial primary key,
  commande_id bigint not null references commandes(id) on delete cascade,
  montant numeric not null check (montant > 0),
  compte_code text not null check (compte_code in ('521000', '571000')),
  date_paiement date not null,
  reference text,
  utilisateur text,
  created_at timestamptz not null default now()
);

create index if not exists idx_commande_paiements_commande_id on commande_paiements(commande_id);
