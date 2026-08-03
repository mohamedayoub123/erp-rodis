-- Run this once in the Supabase SQL Editor (Dashboard > SQL Editor > New query).
-- Remplace le stockage des comptes utilisateurs (storage/stock-users.json),
-- qui ne peut pas survivre sur un hebergement serverless comme Vercel
-- (systeme de fichiers en lecture seule / ephemere).
create table if not exists public.stock_users (
  username text primary key,
  password_hash text not null,
  permissions jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Remplace storage/login-attempts.json (protection anti brute-force sur la connexion).
create table if not exists public.stock_login_attempts (
  username text primary key,
  count integer not null,
  first_failure_at bigint not null,
  locked_until bigint
);
