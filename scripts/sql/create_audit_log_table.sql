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

-- Etape 2 : voir le detail exact d'une modification + restaurer une
-- suppression depuis la page Historique.
-- donnees_avant / donnees_apres contiennent l'etat COMPLET des lignes
-- concernees (pas juste les champs modifies) - a une suppression,
-- donnees_avant est ce qui permet de tout reinserer tel quel via
-- restaurerAuditLogAction (app/admin/historique/actions.ts). "restaure"
-- evite de pouvoir restaurer 2 fois la meme suppression par erreur.
alter table public.audit_log add column if not exists donnees_avant jsonb;
alter table public.audit_log add column if not exists donnees_apres jsonb;
alter table public.audit_log add column if not exists restaure boolean not null default false;
