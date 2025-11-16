-- Optional bootstrap SQL for Postgres/PostGIS
-- NOTE: This project primarily uses Prisma migrations. Only use this script for manual DB setup
-- or when Prisma migrations are not applied. Running both may cause conflicts.

-- Align enum definitions with Prisma schema
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'auth_provider') THEN
    CREATE TYPE "public"."auth_provider" AS ENUM ('google');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'subscription_tier') THEN
    CREATE TYPE "public"."subscription_tier" AS ENUM ('free', 'pro', 'max');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'subscription_status') THEN
    CREATE TYPE "public"."subscription_status" AS ENUM ('active', 'cancelled', 'expired');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_role') THEN
    CREATE TYPE "public"."user_role" AS ENUM ('user', 'admin');
  END IF;
END$$;

CREATE TABLE IF NOT EXISTS public."user" (
  id                    TEXT PRIMARY KEY,
  name                  TEXT,
  email                 TEXT NOT NULL UNIQUE,
  email_verified        TIMESTAMPTZ,
  image                 TEXT,
  provider              "public"."auth_provider" NOT NULL DEFAULT 'google',
  provider_account_id   TEXT NOT NULL,
  role                  "public"."user_role" NOT NULL DEFAULT 'user',
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT user_role_valid CHECK (role IN ('user','admin'))
);

CREATE UNIQUE INDEX IF NOT EXISTS "user_email_key" ON public."user" (email);
CREATE UNIQUE INDEX IF NOT EXISTS "user_provider_account_id_key" ON public."user" (provider_account_id);

CREATE TABLE IF NOT EXISTS public."route" (
  id                   TEXT PRIMARY KEY,
  user_id              TEXT NOT NULL,
  title                TEXT NOT NULL,
  description          TEXT,
  coordinates          JSONB NOT NULL,
  distance_km          DOUBLE PRECISION NOT NULL,
  duration_minutes     INTEGER NOT NULL,
  elevation_gain_m     INTEGER,
  elevation_profile    JSONB,
  is_public            BOOLEAN NOT NULL DEFAULT FALSE,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT route_user_fk FOREIGN KEY (user_id) REFERENCES public."user"(id) ON DELETE CASCADE,
  CONSTRAINT route_distance_positive CHECK (distance_km > 0),
  CONSTRAINT route_duration_positive CHECK (duration_minutes > 0),
  CONSTRAINT route_title_nonempty CHECK (char_length(trim(title)) > 0)
);

CREATE INDEX IF NOT EXISTS "route_user_id_idx" ON public."route"(user_id);
CREATE INDEX IF NOT EXISTS "route_is_public_idx" ON public."route"(is_public);

CREATE TABLE IF NOT EXISTS public."subscription" (
  id                      TEXT PRIMARY KEY,
  user_id                 TEXT NOT NULL,
  tier                    "public"."subscription_tier" NOT NULL,
  status                  "public"."subscription_status" NOT NULL,
  current_period_start    TIMESTAMPTZ NOT NULL,
  current_period_end      TIMESTAMPTZ NOT NULL,
  cancel_at_period_end    BOOLEAN NOT NULL DEFAULT FALSE,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT subscription_user_fk FOREIGN KEY (user_id) REFERENCES public."user"(id) ON DELETE CASCADE,
  CONSTRAINT subscription_tier_valid CHECK (tier IN ('free','pro','max')),
  CONSTRAINT subscription_status_valid CHECK (status IN ('active','cancelled','expired')),
  CONSTRAINT subscription_period_valid CHECK (current_period_end >= current_period_start)
);

CREATE INDEX IF NOT EXISTS "subscription_user_id_idx" ON public."subscription"(user_id);
CREATE INDEX IF NOT EXISTS "subscription_status_idx" ON public."subscription"(status);

COMMIT;
