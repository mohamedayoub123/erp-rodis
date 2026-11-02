-- A coller dans Supabase Dashboard > SQL Editor > New query.
-- Liste des equipements (machines) de la PRODUCTION PLASTIQUE : page Production Plastique > Equipements.
-- Cette liste est a part de la page Equipements de la Production Cosmetique (table machines) : c'est elle, et elle seule,
-- qui est proposee dans la colonne "Machine en cours" de Statistique Article Plastique (E3).
--
-- Idempotent (peut etre relance sans risque). Aucune donnee existante modifiee : les machines deja saisies a la main sur E3
-- sont simplement reprises dans la liste pour qu'elles restent valables.
create table if not exists public.equipements_plastique (
  id bigint generated always as identity primary key,
  nom text not null unique,
  created_at timestamptz not null default now()
);

insert into public.equipements_plastique (nom)
select distinct trim(machine_plastique)
from public.articles_matiere_premiere
where machine_plastique is not null and trim(machine_plastique) <> ''
on conflict (nom) do nothing;
