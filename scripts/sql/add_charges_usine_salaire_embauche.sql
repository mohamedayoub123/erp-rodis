-- Ajoute le salaire des embauches (permanents), distinct des journaliers
-- deja presents. A executer dans Supabase Dashboard > SQL Editor.
alter table public.charges_usine add column if not exists salaire_embauche numeric;
