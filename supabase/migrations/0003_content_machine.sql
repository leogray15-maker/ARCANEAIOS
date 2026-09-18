-- THE ARCANE — the Content Machine's tables.
--
-- Run in the Supabase SQL Editor after 0002 (idempotent; safe to re-run).
--
-- Four kinds of thing, kept apart on purpose:
--   knowledge  — archive_modules, knowledge_sources     what the Archives say
--   content    — content_drafts, content_revisions      what HERALD made and what Leo did to it
--   agents     — agent_runs                             every run, observable
--   records    — system_events                          what happened, append-only
--
-- Access model: row-level security is on and there are deliberately NO
-- policies for anon or authenticated. Only the service role reaches these
-- tables, and the service role lives only in Vercel functions and in .env
-- on the operator's machine. The browser goes through /api/*, which checks
-- the operator key first. The anon key keeps touching arcane_sync only.

-- ---------------------------------------------------------------- knowledge

create table if not exists public.knowledge_sources (
  id             text        primary key,                 -- 'vault' | 'export' | 'notion'
  kind           text        not null,
  location       text        not null default '',
  status         text        not null default 'idle',     -- idle | syncing | ok | error
  last_synced_at timestamptz,
  module_count   integer     not null default 0,
  last_error     text        not null default '',
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create table if not exists public.archive_modules (
  id                text        primary key,              -- the indexer's id: <subject>--<title>--<notion tail>
  notion_id         text        not null default '',
  source_id         text        not null default 'vault' references public.knowledge_sources (id),
  source_path       text        not null default '',
  source_url        text        not null default '',
  title             text        not null,
  subject           text        not null default '',
  parent            text        not null default '',
  lane              text        not null default 'mindset',
  kind              text        not null default 'module', -- module | index
  words             integer     not null default 0,
  sensitive         boolean     not null default false,
  flags             text[]      not null default '{}',
  gate              text        not null default 'open',   -- allowed | open | never (from 05-Knowledge/Archives-Sources.md)
  excerpt           text        not null default '',
  body              text        not null default '',
  content_hash      text        not null default '',
  source_updated_at timestamptz,
  indexed_at        timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  search            tsvector    generated always as (
                      setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
                      setweight(to_tsvector('english', coalesce(subject, '')), 'B') ||
                      setweight(to_tsvector('english', coalesce(body, '')), 'C')
                    ) stored
);
create index if not exists archive_modules_search   on public.archive_modules using gin (search);
create index if not exists archive_modules_subject  on public.archive_modules (subject);
create index if not exists archive_modules_lane     on public.archive_modules (lane);
create index if not exists archive_modules_kind     on public.archive_modules (kind);

-- Subjects with their counts, for the Library's filter. A view, so it is
-- never stale and never a second table to keep in step.
create or replace view public.archive_subjects as
  select subject,
         min(lane)                                   as lane,
         min(gate)                                   as gate,
         count(*) filter (where kind = 'module')     as modules,
         coalesce(sum(words) filter (where kind = 'module'), 0)::integer as words,
         bool_or(sensitive)                          as sensitive
  from public.archive_modules
  group by subject;

-- ---------------------------------------------------------------- content

create table if not exists public.content_drafts (
  id               text        primary key,               -- HER-YYYYMMDD-NNN
  run_id           text        not null default '',
  module_id        text        references public.archive_modules (id) on delete set null,
  parent_id        text        references public.content_drafts (id) on delete set null,  -- the draft this was regenerated from or is a variant of
  agent            text        not null default 'HERALD',
  format           text        not null,                   -- short | medium | thread | email | teaser
  platform         text        not null default 'X',
  status           text        not null default 'draft',   -- draft | review | approved | scheduled | posted | killed  (packages/config loop.js)
  title            text        not null default '',
  hook             text        not null default '',
  body             text        not null default '',
  angle            text        not null default '',
  cta              text        not null default 'none',
  tags             text[]      not null default '{}',
  word_count       integer     not null default 0,
  compliance       text        not null default 'pass',
  compliance_notes text        not null default '',
  source_subject   text        not null default '',
  source_module    text        not null default '',
  source_ref       text        not null default '',
  source_url       text        not null default '',
  source_note      text        not null default '',
  revision         integer     not null default 1,
  model            text        not null default '',
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  approved_at      timestamptz,
  rejected_at      timestamptz,
  scheduled_for    timestamptz,
  published_at     timestamptz,
  published_url    text        not null default '',
  constraint content_drafts_status check (status in ('draft', 'review', 'approved', 'scheduled', 'posted', 'killed')),
  constraint content_drafts_format check (format in ('short', 'medium', 'thread', 'email', 'teaser'))
);
create index if not exists content_drafts_status  on public.content_drafts (status, created_at desc);
create index if not exists content_drafts_module  on public.content_drafts (module_id);
create index if not exists content_drafts_run     on public.content_drafts (run_id);

create table if not exists public.content_revisions (
  id            bigserial   primary key,
  draft_id      text        not null references public.content_drafts (id) on delete cascade,
  revision      integer     not null,
  kind          text        not null,                       -- generated | edit | status | regenerate
  actor         text        not null default 'leo',         -- leo | HERALD
  status_before text        not null default '',
  status_after  text        not null default '',
  title         text        not null default '',
  body          text        not null default '',
  platform      text        not null default '',
  note          text        not null default '',
  created_at    timestamptz not null default now(),
  unique (draft_id, revision)
);

-- ---------------------------------------------------------------- agents

create table if not exists public.agent_runs (
  id          text        primary key,                    -- HER-R-YYYYMMDD-NNN
  agent       text        not null,
  skill       text        not null default '',
  objective   text        not null default '',
  status      text        not null default 'running',     -- running | ok | failed | refused
  model       text        not null default '',
  input       jsonb       not null default '{}'::jsonb,   -- module id, formats, options
  sources     text[]      not null default '{}',
  output      jsonb       not null default '{}'::jsonb,   -- draft ids, warnings
  usage       jsonb       not null default '{}'::jsonb,   -- tokens in/out/cached
  error       text        not null default '',
  device      text        not null default '',            -- the sync code that asked
  started_at  timestamptz not null default now(),
  finished_at timestamptz
);
create index if not exists agent_runs_started on public.agent_runs (started_at desc);

-- ---------------------------------------------------------------- records

create table if not exists public.system_events (
  id           bigserial   primary key,
  at           timestamptz not null default now(),
  kind         text        not null,                       -- draft.generated | draft.status | draft.edited | run.ok | run.failed | sync.modules ...
  actor        text        not null default '',            -- leo | HERALD | tools/archives-sync.mjs
  subject_type text        not null default '',            -- draft | module | run | source
  subject_id   text        not null default '',
  summary      text        not null default '',
  data         jsonb       not null default '{}'::jsonb
);
create index if not exists system_events_at on public.system_events (at desc);

-- ---------------------------------------------------------------- housekeeping

-- 0001/0002 own arcane_touch(), which stamps a column named `updated`. The
-- tables above use `updated_at`, so they get their own function and neither
-- migration can break the other's triggers whichever order they are run in.
create or replace function public.arcane_touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;

drop trigger if exists archive_modules_touch    on public.archive_modules;
drop trigger if exists content_drafts_touch     on public.content_drafts;
drop trigger if exists knowledge_sources_touch  on public.knowledge_sources;
create trigger archive_modules_touch   before update on public.archive_modules   for each row execute function public.arcane_touch_updated_at();
create trigger content_drafts_touch    before update on public.content_drafts    for each row execute function public.arcane_touch_updated_at();
create trigger knowledge_sources_touch before update on public.knowledge_sources for each row execute function public.arcane_touch_updated_at();

alter table public.knowledge_sources enable row level security;
alter table public.archive_modules   enable row level security;
alter table public.content_drafts    enable row level security;
alter table public.content_revisions enable row level security;
alter table public.agent_runs        enable row level security;
alter table public.system_events     enable row level security;
-- no policies: service role only

insert into public.knowledge_sources (id, kind, location)
  values ('vault', 'obsidian-vault', ''), ('export', 'notion-html-export', ''), ('notion', 'notion-api', '')
  on conflict (id) do nothing;

notify pgrst, 'reload schema';
