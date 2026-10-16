-- A coller dans Supabase Dashboard > SQL Editor > New query.
-- Suivi automatique des conteneurs d'un dossier Import MP (page Import MP : on tape le n° de conteneur du dossier, l'ERP interroge
-- Terminal49 et affiche le navire, la position, l'arrivee prevue... - page Suivi conteneurs avec carte).
-- Un dossier est identifie par la paire (doss. 4D, doss. ERP), comme dossiers_import_mp_statut ; il peut avoir plusieurs conteneurs.
-- Idempotent (peut etre relance sans risque), aucune donnee existante modifiee.
create table if not exists public.suivi_conteneurs_import (
  id bigserial primary key,
  n_doss_4d text,
  n_doss_erp text,
  numero_conteneur text not null,
  numero_bl text,
  demande_id text,
  expedition_id text,
  etat jsonb,
  message text,
  derniere_maj timestamptz,
  cree_par text,
  created_at timestamptz not null default now()
);

-- Un meme conteneur ne peut pas etre ajoute deux fois au meme dossier
create unique index if not exists suivi_conteneurs_import_unique
  on public.suivi_conteneurs_import (coalesce(n_doss_4d, ''), coalesce(n_doss_erp, ''), numero_conteneur);
