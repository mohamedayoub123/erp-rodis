-- A coller dans Supabase Dashboard > SQL Editor > New query.
--
-- TO1.2026, TI1.2026... etaient calcules au RANG parmi les lignes existantes
-- (jamais stockes) - en supprimer un decalait automatiquement le numero de
-- tous ceux venus apres. On stocke maintenant le numero a la creation (meme
-- principe deja utilise pour "MB" sur programmes.numero_programme : le plus
-- grand numero existant pour cette annee + 1) - stable pour toujours, plus
-- aucun decalage possible en supprimant un Transfer Order/Transfer Invoice.
alter table public.transfer_orders add column if not exists numero integer;
alter table public.invoice_orders add column if not exists numero integer;

-- Backfill : donne aux lignes existantes le numero qu'elles affichent deja
-- aujourd'hui (rang par annee, trie par date de creation), pour ne rien
-- changer a l'affichage actuel au moment de ce script.
with ranked as (
  select id, row_number() over (partition by extract(year from date_jour) order by created_at asc) as rn
  from public.transfer_orders
)
update public.transfer_orders t
set numero = ranked.rn
from ranked
where t.id = ranked.id and t.numero is null;

with ranked as (
  select id, row_number() over (partition by extract(year from date_jour) order by created_at asc) as rn
  from public.invoice_orders
)
update public.invoice_orders t
set numero = ranked.rn
from ranked
where t.id = ranked.id and t.numero is null;
