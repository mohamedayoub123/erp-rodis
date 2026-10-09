-- Revue Processus PR4 par trimestre : saisie de la "production realisee" (%) mois par mois.
-- A coller dans Supabase Dashboard > SQL Editor > New query.
--
-- Sert au graphique KPI "% temps d'arret et production realisee" quand le rapport Carton Mensuel n'a pas le mois
-- (ex : juin, juillet 2026). Une valeur saisie prime sur les autres sources du graphique (page et PowerPoint).
create table if not exists public.pr4_production_realisee (
  annee int not null,
  mois int not null check (mois between 1 and 12),
  pourcentage numeric not null check (pourcentage >= 0 and pourcentage <= 200),
  utilisateur text,
  date_saisie timestamptz not null default now(),
  primary key (annee, mois)
);

-- Acces uniquement par le serveur de l'ERP (cle service), jamais depuis un navigateur
alter table public.pr4_production_realisee enable row level security;
