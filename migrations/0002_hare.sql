create table if not exists github_connections (
  user_id text primary key,
  github_login text not null,
  github_user_id text not null,
  token text not null,
  token_last4 text not null,
  action_secret text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists watched_repos (
  id serial primary key,
  user_id text not null,
  owner text not null,
  repo text not null,
  auto_review boolean not null default true,
  auto_post boolean not null default true,
  webhook_secret text not null,
  ignore_globs text not null default '',
  created_at timestamptz not null default now(),
  unique (user_id, owner, repo)
);
create index if not exists watched_repos_user_id_idx on watched_repos (user_id);

create table if not exists pull_requests (
  id serial primary key,
  user_id text not null,
  owner text not null,
  repo text not null,
  number integer not null,
  title text not null,
  body text,
  author text not null,
  state text not null,
  draft boolean not null default false,
  html_url text not null,
  head_sha text not null,
  base_sha text not null,
  head_ref text not null,
  base_ref text not null,
  additions integer not null default 0,
  deletions integer not null default 0,
  changed_files integer not null default 0,
  is_demo boolean not null default false,
  github_updated_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, owner, repo, number)
);
create index if not exists pull_requests_user_id_idx on pull_requests (user_id);

create table if not exists reviews (
  id serial primary key,
  user_id text not null,
  pr_id integer not null references pull_requests(id) on delete cascade,
  head_sha text not null,
  status text not null,
  summary text,
  walkthrough text,
  effort integer,
  files_json text,
  posted boolean not null default false,
  post_error text,
  github_review_id text,
  error text,
  incremental boolean not null default false,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (pr_id, head_sha)
);
create index if not exists reviews_user_pr_idx on reviews (user_id, pr_id);

create table if not exists findings (
  id serial primary key,
  review_id integer not null references reviews(id) on delete cascade,
  severity text not null,
  category text not null default 'bug',
  file_path text not null,
  line integer,
  start_line integer,
  title text not null,
  body text not null,
  suggestion text,
  posted boolean not null default false
);
create index if not exists findings_review_id_idx on findings (review_id);
