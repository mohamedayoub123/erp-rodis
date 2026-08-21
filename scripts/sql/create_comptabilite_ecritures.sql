-- A coller dans Supabase Dashboard > SQL Editor > New query (2/3).
-- Journal comptable (partie double) - Module Comptabilite, Phase 1.
-- Une ecriture = un evenement reel de l'ERP (reception MP, fabrication,
-- entree production...), toujours plusieurs lignes equilibrees
-- (somme debit = somme credit), jamais saisie a la main pour l'instant.
create table if not exists public.ecritures_comptables (
  id bigserial primary key,
  date_ecriture date not null,
  piece_reference text,
  libelle text not null,
  source_type text not null,
  source_id text not null,
  created_by text,
  created_at timestamptz not null default now()
);

create table if not exists public.ecriture_lignes (
  id bigserial primary key,
  ecriture_id bigint not null references public.ecritures_comptables(id) on delete cascade,
  compte_id bigint not null references public.comptes_comptables(id),
  debit numeric not null default 0,
  credit numeric not null default 0
);

create index if not exists idx_ecritures_comptables_source
  on public.ecritures_comptables (source_type, source_id);
create index if not exists idx_ecriture_lignes_ecriture_id
  on public.ecriture_lignes (ecriture_id);
create index if not exists idx_ecriture_lignes_compte_id
  on public.ecriture_lignes (compte_id);
