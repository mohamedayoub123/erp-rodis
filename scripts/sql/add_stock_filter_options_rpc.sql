-- Les listes deroulantes "Annee" (Stock MP + Stock PF) et "numero de lot"
-- (Stock MP) chargeaient toute la table juste pour en deduire les valeurs
-- distinctes en JS. Postgres le fait directement, sans jamais renvoyer les
-- 41 000+ / 16 000+ lignes brutes a l'application.

create or replace function stock_mp_available_years()
returns table(year int)
language sql
stable
as $$
  select distinct extract(year from date_jour)::int as year
  from lots_stock_matiere_premiere
  where date_jour is not null
  order by year desc;
$$;

create or replace function stock_mp_available_codes()
returns table(code text)
language sql
stable
as $$
  select distinct numero_lot as code
  from lots_stock_matiere_premiere
  where numero_lot is not null and btrim(numero_lot) <> ''
  order by code;
$$;

create or replace function stock_pf_available_years()
returns table(year int)
language sql
stable
as $$
  select distinct extract(year from date_jour)::int as year
  from lots_stock
  where date_jour is not null
  order by year desc;
$$;
