-- Revue Processus PR4 par trimestre : deux nouvelles tables. A coller dans Supabase Dashboard > SQL Editor > New query.
--
-- 1) pr4_production_realisee : "production realisee" (%) saisie mois par mois pour le graphique KPI
--    "% temps d'arret et production realisee" quand le rapport Carton Mensuel n'a pas le mois (ex : juin, juillet 2026).
--    Une valeur saisie prime sur les autres sources du graphique.
-- 2) pr4_revue_figee : rapport d'un trimestre FIGE (photo des chiffres au moment de la validation). Une fois fige,
--    la page et le PowerPoint montrent ces chiffres, meme si l'ERP est corrige ensuite.
create table if not exists public.pr4_production_realisee (
  annee int not null,
  mois int not null check (mois between 1 and 12),
  pourcentage numeric not null check (pourcentage >= 0 and pourcentage <= 200),
  utilisateur text,
  date_saisie timestamptz not null default now(),
  primary key (annee, mois)
);

create table if not exists public.pr4_revue_figee (
  code text primary key,
  donnees jsonb not null,
  fige_par text,
  fige_le timestamptz not null default now()
);

-- Acces uniquement par le serveur de l ERP (cle service), jamais depuis un navigateur
alter table public.pr4_production_realisee enable row level security;
alter table public.pr4_revue_figee enable row level security;
