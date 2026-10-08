export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS prompts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  text TEXT NOT NULL,
  audience TEXT NOT NULL,
  subtopics TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS responses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  prompt_id INTEGER NOT NULL REFERENCES prompts(id),
  surface TEXT NOT NULL,
  run_number INTEGER NOT NULL,
  raw_text TEXT NOT NULL,
  source_type TEXT NOT NULL,
  location_note TEXT NOT NULL,
  captured_at TEXT NOT NULL,
  UNIQUE(prompt_id, surface, run_number)
);

CREATE TABLE IF NOT EXISTS analyses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  response_id INTEGER NOT NULL UNIQUE REFERENCES responses(id),
  judge_json TEXT NOT NULL,
  judge_model TEXT NOT NULL,
  analyzed_at TEXT NOT NULL,
  error_flag INTEGER NOT NULL DEFAULT 0,
  manual_override INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS serp_cache (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  engine TEXT NOT NULL,
  params_hash TEXT NOT NULL UNIQUE,
  params_json TEXT NOT NULL,
  raw_json TEXT NOT NULL,
  credits_charged INTEGER NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS serp_organic (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  prompt_id INTEGER NOT NULL UNIQUE REFERENCES prompts(id),
  target_ranked INTEGER NOT NULL,
  target_position INTEGER,
  competitor_domains TEXT NOT NULL,
  paa TEXT NOT NULL,
  related_searches TEXT NOT NULL,
  aio_shown INTEGER,
  fetched_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS trends (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  term_key TEXT NOT NULL,
  data_type TEXT NOT NULL,
  raw_json TEXT NOT NULL,
  fetched_at TEXT NOT NULL,
  UNIQUE(term_key, data_type)
);

CREATE TABLE IF NOT EXISTS autocomplete (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  term TEXT NOT NULL UNIQUE,
  raw_json TEXT NOT NULL,
  fetched_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS config (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  payload TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS serp_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT NOT NULL,
  engine TEXT,
  ok INTEGER NOT NULL,
  cached INTEGER NOT NULL,
  credits_charged INTEGER NOT NULL,
  error TEXT,
  prompt_id INTEGER,
  params_hash TEXT
);

CREATE TABLE IF NOT EXISTS recommendations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  prompt_id INTEGER NOT NULL,
  kind TEXT NOT NULL,
  payload TEXT NOT NULL,
  model TEXT NOT NULL,
  created_at TEXT NOT NULL
);
`;
