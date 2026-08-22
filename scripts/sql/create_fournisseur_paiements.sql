-- Suivi des paiements faits A un fournisseur - meme principe que
-- commande_paiements (qui fait redescendre 411000 Clients), mais dans
-- l'autre sens : fait redescendre 401000 Fournisseurs quand on paie
-- reellement une facture d'achat MP.
create table if not exists fournisseur_paiements (
  id bigserial primary key,
  fournisseur_id bigint not null references fournisseurs(id) on delete cascade,
  montant numeric not null check (montant > 0),
  compte_code text not null check (compte_code in ('521000', '571000')),
  date_paiement date not null,
  reference text,
  utilisateur text,
  created_at timestamptz not null default now()
);

create index if not exists idx_fournisseur_paiements_fournisseur_id on fournisseur_paiements(fournisseur_id);
