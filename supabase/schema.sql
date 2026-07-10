-- ============================================================================
-- INFLUENCE AWARD — Schéma Supabase
-- À exécuter dans : Supabase Dashboard > SQL Editor > New query
-- ============================================================================

-- Extension pour générer des UUID
create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- CATÉGORIES
-- ---------------------------------------------------------------------------
create table categories (
  id text primary key,              -- ex: 'createurs'
  label text not null,              -- ex: 'Créateur de Contenu'
  tag text,                         -- ex: 'Digital'
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- CANDIDATS
-- ---------------------------------------------------------------------------
create table candidates (
  id uuid primary key default gen_random_uuid(),
  category_id text not null references categories(id) on delete cascade,
  name text not null,
  bio text,
  photo_url text,                   -- URL Supabase Storage
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create index idx_candidates_category on candidates(category_id);

-- ---------------------------------------------------------------------------
-- TRANSACTIONS DE VOTE
-- Une ligne = une tentative de vote payant. Le vote ne compte
-- que lorsque status = 'confirmed' (confirmé par le webhook CinetPay).
-- ---------------------------------------------------------------------------
create table vote_transactions (
  id uuid primary key default gen_random_uuid(),
  transaction_ref text unique not null,   -- notre référence interne
  category_id text not null references categories(id),
  candidate_id uuid not null references candidates(id),
  phone_number text not null,             -- numéro normalisé (8 chiffres)
  amount int not null default 100,        -- FCFA
  currency text not null default 'XOF',
  status text not null default 'pending'  -- pending | confirmed | failed
    check (status in ('pending', 'confirmed', 'failed')),
  payment_provider text,                  -- nita_transfert | amana_transfert | airtel_money | moov_flooz | zamani_cash
  provider_reference text,                -- reference_transaction renvoyée par KomiPay
  code_achat text,                        -- code de confirmation MyNita (si applicable)
  payment_method text,
  provider_payload jsonb,                 -- réponse brute du fournisseur pour audit
  created_at timestamptz not null default now(),
  confirmed_at timestamptz
);

create index idx_vote_tx_status on vote_transactions(status);
create index idx_vote_tx_category on vote_transactions(category_id);
create index idx_vote_tx_candidate on vote_transactions(candidate_id);
create index idx_vote_tx_phone_category on vote_transactions(category_id, phone_number);

-- Pas de contrainte d'unicité ici : un même numéro peut voter plusieurs fois
-- (dans une même catégorie ou entre catégories), tant qu'il paie à chaque vote.
-- L'index ci-dessus sert seulement à retrouver rapidement l'historique d'un numéro.

-- ---------------------------------------------------------------------------
-- VUE : décompte des votes confirmés par candidat
-- ---------------------------------------------------------------------------
create view candidate_vote_counts as
select
  c.id as candidate_id,
  c.category_id,
  c.name,
  count(vt.id) filter (where vt.status = 'confirmed') as votes,
  count(vt.id) filter (where vt.status = 'confirmed') * 100 as revenue_fcfa
from candidates c
left join vote_transactions vt on vt.candidate_id = c.id
group by c.id, c.category_id, c.name;

-- ---------------------------------------------------------------------------
-- PARTENAIRES — affichés en défilement sur le site public
-- ---------------------------------------------------------------------------
create table partners (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  logo_url text,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- CLASSEMENT PUBLIC — pour affichage en direct sur le site
-- Expose uniquement les totaux de votes, jamais les numéros de téléphone
-- ni les montants (déjà visibles côté admin uniquement).
-- ---------------------------------------------------------------------------
create view public_leaderboard as
select candidate_id, category_id, name, votes
from candidate_vote_counts;

grant select on public_leaderboard to anon, authenticated;

-- ---------------------------------------------------------------------------
-- ADMINISTRATEURS
-- Table qui liste les emails autorisés à accéder au tableau de bord.
-- L'authentification elle-même se fait via Supabase Auth (email + mot de passe).
-- ---------------------------------------------------------------------------
create table admin_users (
  email text primary key,
  created_at timestamptz not null default now()
);

-- Ajoute ici l'email de l'organisateur (à faire une fois, remplace la valeur) :
-- insert into admin_users (email) values ('rahma@example.com');

-- ---------------------------------------------------------------------------
-- ROW LEVEL SECURITY
-- Lecture publique des catégories / candidats / décompte de votes (résultats publics).
-- Écriture uniquement via le backend (clé service_role, qui contourne RLS).
-- ---------------------------------------------------------------------------
alter table categories enable row level security;
alter table candidates enable row level security;
alter table partners enable row level security;
alter table vote_transactions enable row level security;
alter table admin_users enable row level security;

create policy "Lecture publique des catégories"
  on categories for select using (true);

create policy "Lecture publique des candidats"
  on candidates for select using (true);

create policy "Lecture publique des partenaires"
  on partners for select using (true);

-- Les transactions ne sont jamais lues directement par le front public :
-- seul le backend (service_role) et l'admin authentifié y accèdent.
create policy "Admin lit les transactions"
  on vote_transactions for select
  using (auth.jwt() ->> 'email' in (select email from admin_users));

create policy "Admin lit la liste admin"
  on admin_users for select
  using (auth.jwt() ->> 'email' in (select email from admin_users));

-- ---------------------------------------------------------------------------
-- PRIVILÈGES (GRANT)
-- La RLS ne suffit pas à elle seule : Postgres exige aussi une permission de
-- base sur la table. Sans ces lignes, PostgREST renvoie 401 "permission
-- denied" (code 42501) même pour une table en lecture publique.
-- ---------------------------------------------------------------------------
grant usage on schema public to anon, authenticated;
grant select on categories to anon, authenticated;
grant select on candidates to anon, authenticated;
grant select on partners to anon, authenticated;
grant select on candidate_vote_counts to anon, authenticated;
grant select on vote_transactions to authenticated;
grant select on admin_users to authenticated;

-- Le backend admin utilise la clé service_role (routes API /api/admin/*,
-- webhook de paiement). Comme pour anon/authenticated, la RLS ne suffit pas :
-- il faut aussi le GRANT de base sur chaque table.
grant select, insert, update, delete on categories to service_role;
grant select, insert, update, delete on candidates to service_role;
grant select, insert, update, delete on partners to service_role;
grant select, insert, update on vote_transactions to service_role;
grant select on candidate_vote_counts to service_role;
grant select on public_leaderboard to service_role;
grant select on admin_users to service_role;

-- ---------------------------------------------------------------------------
-- STOCKAGE — bucket public pour les photos de candidats
-- Public en lecture (n'importe qui peut voir une photo via son URL), mais
-- l'upload ne passe que par le backend admin (clé service_role, qui
-- contourne toute policy de toute façon).
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('candidate-photos', 'candidate-photos', true)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('partner-logos', 'partner-logos', true)
on conflict (id) do nothing;

