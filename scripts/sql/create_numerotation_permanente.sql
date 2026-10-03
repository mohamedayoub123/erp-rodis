-- Numerotation PERMANENTE des documents (PL, PD, TE, TS, TO, TI, CLAB, MB, IM...).
--
-- Avant : la plupart des codes (PL1.2026, PD3, TE12, TS8, CLAB2...) etaient
-- recalcules a chaque affichage selon l'ordre de creation. Supprimer un
-- document decalait donc le numero de tous les suivants, et un nouveau
-- document pouvait reprendre un numero deja utilise.
--
-- Maintenant : chaque document recoit son numero UNE FOIS, stocke ici, et
-- ce numero n'est jamais reattribue, meme si le document est supprime.
--
--   document_numeros   : numero attribue a chaque document (kind + ref_id).
--                        Les lignes ne sont JAMAIS supprimees : un document
--                        efface garde son numero "reserve".
--   document_compteurs : dernier numero attribue par (kind, annee). Ne
--                        redescend jamais.
--
-- Aucune donnee existante n'est modifiee ou supprimee par ce script.

create table if not exists public.document_numeros (
  kind text not null,
  ref_id bigint not null,
  annee integer not null default 0,
  numero integer not null,
  created_at timestamptz not null default now(),
  primary key (kind, ref_id),
  constraint document_numeros_numero_unique unique (kind, annee, numero)
);

create table if not exists public.document_compteurs (
  kind text not null,
  annee integer not null default 0,
  dernier_numero integer not null default 0,
  primary key (kind, annee)
);

alter table public.document_numeros enable row level security;
alter table public.document_compteurs enable row level security;

-- Lit tous les numeros d'un type de document, en un seul appel (jsonb : une
-- table serait tronquee a 1000 lignes par l'API).
create or replace function public.document_lire_numeros(p_kind text)
returns jsonb
language sql
stable
as $$
  select coalesce(
    jsonb_agg(jsonb_build_object('ref_id', ref_id, 'annee', annee, 'numero', numero)),
    '[]'::jsonb
  )
  from public.document_numeros
  where kind = p_kind;
$$;

-- Attribue un numero a chaque document pas encore numerote, DANS L'ORDRE
-- fourni (ordre de creation). p_items = [{"ref_id": 12, "annee": 2026}, ...].
-- Un document deja numerote garde son numero. Verrou par type pour que deux
-- enregistrements simultanes n'obtiennent jamais le meme numero.
create or replace function public.document_attribuer_numeros(p_kind text, p_items jsonb)
returns jsonb
language plpgsql
as $$
declare
  item jsonb;
  v_ref bigint;
  v_annee integer;
  v_annee_existante integer;
  v_numero integer;
  v_result jsonb := '[]'::jsonb;
begin
  perform pg_advisory_xact_lock(hashtext('document_numeros:' || p_kind));

  for item in select * from jsonb_array_elements(p_items) loop
    v_ref := (item ->> 'ref_id')::bigint;
    v_annee := coalesce((item ->> 'annee')::integer, 0);

    select d.numero, d.annee into v_numero, v_annee_existante
    from public.document_numeros d
    where d.kind = p_kind and d.ref_id = v_ref;

    if found then
      v_annee := v_annee_existante;
    else
      insert into public.document_compteurs (kind, annee, dernier_numero)
      values (p_kind, v_annee, 1)
      on conflict (kind, annee)
        do update set dernier_numero = public.document_compteurs.dernier_numero + 1
      returning dernier_numero into v_numero;

      insert into public.document_numeros (kind, ref_id, annee, numero)
      values (p_kind, v_ref, v_annee, v_numero);
    end if;

    v_result := v_result || jsonb_build_array(
      jsonb_build_object('ref_id', v_ref, 'annee', v_annee, 'numero', v_numero)
    );
  end loop;

  return v_result;
end;
$$;

-- Prochain numero d'un compteur (TO, TI, MB, IM...). p_plancher = plus grand
-- numero deja existant que l'appelant connait : le compteur ne repart jamais
-- en dessous, mais ne redescend pas non plus si un document a ete supprime.
create or replace function public.document_prochain_numero(
  p_kind text,
  p_annee integer default 0,
  p_plancher integer default 0
)
returns integer
language plpgsql
as $$
declare
  v_numero integer;
begin
  perform pg_advisory_xact_lock(hashtext('document_numeros:' || p_kind));

  insert into public.document_compteurs (kind, annee, dernier_numero)
  values (p_kind, p_annee, greatest(p_plancher, 0) + 1)
  on conflict (kind, annee)
    do update set dernier_numero = greatest(public.document_compteurs.dernier_numero, greatest(p_plancher, 0)) + 1
  returning dernier_numero into v_numero;

  return v_numero;
end;
$$;

revoke all on function public.document_lire_numeros(text) from public;
revoke all on function public.document_attribuer_numeros(text, jsonb) from public;
revoke all on function public.document_prochain_numero(text, integer, integer) from public;
grant execute on function public.document_lire_numeros(text) to service_role;
grant execute on function public.document_attribuer_numeros(text, jsonb) to service_role;
grant execute on function public.document_prochain_numero(text, integer, integer) to service_role;
