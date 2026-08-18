-- Ajoute a pr4_formation_plan : case "realise" par mois (pour la couleur
-- verte) et pieces jointes par mois (fichier/dossier attache a l'endroit ou
-- la date est saisie). Couleur de la cellule calculee cote app : vert si
-- realise, rouge si la date est depassee sans etre cochee realise, jaune si
-- planifie mais date pas encore depassee, "-" si pas planifie.
alter table pr4_formation_plan
  add column if not exists m1_realise boolean not null default false,
  add column if not exists m2_realise boolean not null default false,
  add column if not exists m3_realise boolean not null default false,
  add column if not exists m4_realise boolean not null default false,
  add column if not exists m5_realise boolean not null default false,
  add column if not exists m6_realise boolean not null default false,
  add column if not exists m7_realise boolean not null default false,
  add column if not exists m8_realise boolean not null default false,
  add column if not exists m9_realise boolean not null default false,
  add column if not exists m10_realise boolean not null default false,
  add column if not exists m11_realise boolean not null default false,
  add column if not exists m12_realise boolean not null default false,
  add column if not exists m1_pieces_jointes jsonb not null default '[]'::jsonb,
  add column if not exists m2_pieces_jointes jsonb not null default '[]'::jsonb,
  add column if not exists m3_pieces_jointes jsonb not null default '[]'::jsonb,
  add column if not exists m4_pieces_jointes jsonb not null default '[]'::jsonb,
  add column if not exists m5_pieces_jointes jsonb not null default '[]'::jsonb,
  add column if not exists m6_pieces_jointes jsonb not null default '[]'::jsonb,
  add column if not exists m7_pieces_jointes jsonb not null default '[]'::jsonb,
  add column if not exists m8_pieces_jointes jsonb not null default '[]'::jsonb,
  add column if not exists m9_pieces_jointes jsonb not null default '[]'::jsonb,
  add column if not exists m10_pieces_jointes jsonb not null default '[]'::jsonb,
  add column if not exists m11_pieces_jointes jsonb not null default '[]'::jsonb,
  add column if not exists m12_pieces_jointes jsonb not null default '[]'::jsonb;
