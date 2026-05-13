-- Enable trigram extension for fuzzy search
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE IF NOT EXISTS individuals (
  id          TEXT PRIMARY KEY,
  full_name   TEXT NOT NULL,
  sex         CHAR(1) NOT NULL DEFAULT 'U' CHECK (sex IN ('M', 'F', 'U', 'X')),
  birth_date  TEXT,
  birth_place TEXT,
  death_date  TEXT,
  death_place TEXT,
  burial_date TEXT,
  burial_place TEXT,
  notes       TEXT
);

CREATE INDEX IF NOT EXISTS idx_individuals_name_trgm
  ON individuals USING GIN (full_name gin_trgm_ops);

CREATE TABLE IF NOT EXISTS families (
  id             TEXT PRIMARY KEY,
  husband_id     TEXT REFERENCES individuals(id),
  wife_id        TEXT REFERENCES individuals(id),
  marriage_date  TEXT,
  marriage_place TEXT
);

CREATE TABLE IF NOT EXISTS family_members (
  family_id     TEXT NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  individual_id TEXT NOT NULL REFERENCES individuals(id) ON DELETE CASCADE,
  role          TEXT NOT NULL DEFAULT 'child',
  PRIMARY KEY (family_id, individual_id)
);

CREATE TABLE IF NOT EXISTS events (
  id            SERIAL PRIMARY KEY,
  individual_id TEXT NOT NULL REFERENCES individuals(id) ON DELETE CASCADE,
  type          TEXT NOT NULL,
  date          TEXT,
  place         TEXT,
  description   TEXT
);

CREATE TABLE IF NOT EXISTS media (
  id            SERIAL PRIMARY KEY,
  individual_id TEXT NOT NULL REFERENCES individuals(id) ON DELETE CASCADE,
  blob_url      TEXT NOT NULL,
  media_type    TEXT NOT NULL DEFAULT 'photo',
  title         TEXT,
  description   TEXT
);

CREATE INDEX IF NOT EXISTS idx_families_husband        ON families(husband_id);
CREATE INDEX IF NOT EXISTS idx_families_wife           ON families(wife_id);
CREATE INDEX IF NOT EXISTS idx_family_members_individual ON family_members(individual_id);
CREATE INDEX IF NOT EXISTS idx_events_individual       ON events(individual_id);
CREATE INDEX IF NOT EXISTS idx_media_individual        ON media(individual_id);

-- Auth.js v5 tables (pg adapter)
CREATE TABLE IF NOT EXISTS users (
  id              TEXT        NOT NULL PRIMARY KEY,
  name            TEXT,
  email           TEXT        UNIQUE,
  "emailVerified" TIMESTAMPTZ,
  image           TEXT
);

CREATE TABLE IF NOT EXISTS accounts (
  id                  TEXT NOT NULL PRIMARY KEY,
  "userId"            TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type                TEXT NOT NULL,
  provider            TEXT NOT NULL,
  "providerAccountId" TEXT NOT NULL,
  refresh_token       TEXT,
  access_token        TEXT,
  expires_at          BIGINT,
  id_token            TEXT,
  scope               TEXT,
  session_state       TEXT,
  token_type          TEXT
);

CREATE TABLE IF NOT EXISTS sessions (
  id             TEXT        NOT NULL PRIMARY KEY,
  "userId"       TEXT        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires        TIMESTAMPTZ NOT NULL,
  "sessionToken" TEXT        NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS verification_token (
  identifier TEXT        NOT NULL,
  expires    TIMESTAMPTZ NOT NULL,
  token      TEXT        NOT NULL,
  PRIMARY KEY (identifier, token)
);
