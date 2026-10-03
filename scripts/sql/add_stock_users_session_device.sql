-- Admin > "Qui est connecte" : montre sur quel poste chaque utilisateur est
-- connecte. A chaque connexion, l'appli enregistre l'adresse IP et le
-- systeme/navigateur (ex: "Windows - Chrome") du login le plus recent.
-- Un site web ne peut pas lire le nom de l'ordinateur lui-meme.
--
-- Ajout de 2 colonnes seulement - aucune donnee existante n'est modifiee.
-- Tant que ce script n'est pas execute, l'appli fonctionne normalement
-- (l'information de poste reste simplement vide).
alter table public.stock_users
  add column if not exists session_ip text,
  add column if not exists session_appareil text;
