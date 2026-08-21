-- A coller dans Supabase Dashboard > SQL Editor > New query.
-- "Machines Energie" (type = "Energie", ex: groupe electrogene) : source
-- partagee dont le kW alimente PLUSIEURS machines de Fabrication/
-- Conditionnement a la fois - contrairement a consommation_electrique_kw
-- (deja propre a chaque machine), le cout d'une machine Energie se divise
-- entre les machines actives un jour donne (voir lib/cout-production-reel.ts).
-- energie_machine_id sur une machine normale = la machine Energie dont elle
-- depend (optionnel, une seule a la fois).
--
-- Idempotent (peut etre relance sans risque) - colonne nullable, aucune
-- donnee existante modifiee.
alter table public.machines
  add column if not exists energie_machine_id bigint references public.machines(id) on delete set null;
