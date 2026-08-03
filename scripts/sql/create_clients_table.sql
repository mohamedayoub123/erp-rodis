-- Run this once in the Supabase SQL Editor (Dashboard > SQL Editor > New query).
create table if not exists public.clients (
  id bigserial primary key,
  nom_client text not null,
  client_normalise text not null,
  pays text,
  mode_transport text,
  created_at timestamptz not null default now(),
  unique (client_normalise)
);
