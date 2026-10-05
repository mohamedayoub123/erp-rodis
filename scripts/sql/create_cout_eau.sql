-- Module "Cout - Prix du litre d'eau" : stocke les prix saisis (filtres 10/5/1
-- micron, produits test TH et chlore, chlore, bisulfite, UV, membrane, sel,
-- electricite) pour calculer le prix de revient d'1 litre d'eau.
--
-- Une seule ligne (id = 1) contenant toute la saisie en JSON. Aucune donnee
-- existante n'est modifiee.
create table if not exists public.cout_eau_config (
  id integer primary key default 1,
  donnees jsonb not null default '{}'::jsonb,
  updated_by text,
  updated_at timestamptz not null default now(),
  constraint cout_eau_config_une_seule_ligne check (id = 1)
);

alter table public.cout_eau_config enable row level security;
