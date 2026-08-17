-- Journal des modifications/suppressions (qui/quoi/quand), demande par
-- l'utilisateur pour savoir qui a modifie/supprime/termine une commande ou
-- une ligne de stock. A executer dans Supabase Dashboard > SQL Editor.
--
-- "resume" est une phrase lisible directement affichable sur le dashboard
-- (ex: "Commande 3888-2 supprimee", "Lot AA4125 modifie : qte entree 285 -> 300")
-- plutot qu'un diff JSON brut - plus simple a lire pour un utilisateur non
-- technique, coherent avec le reste de l'app.
create table if not exists public.audit_log (
  id bigserial primary key,
  created_at timestamptz not null default now(),
  utilisateur text,
  module text not null,
  action text not null check (action in ('creation', 'modification', 'suppression')),
  cible text,
  resume text not null
);

create index if not exists audit_log_created_at_idx on public.audit_log (created_at desc);
create index if not exists audit_log_module_idx on public.audit_log (module);
create index if not exists audit_log_utilisateur_idx on public.audit_log (utilisateur);
