-- App release settings (forced update) and maintenance windows (bidding paused, time added back).
-- Timestamps are UTC wall time like the rest of the schema, so defaults use NOW() AT TIME ZONE 'UTC'.

-- One row (id = 1). Empty columns fall back to env defaults in the API.
CREATE TABLE "app_settings" (
  "id" SMALLINT NOT NULL DEFAULT 1 CHECK ("id" = 1),
  "min_app_version" VARCHAR(20),
  "latest_app_version" VARCHAR(20),
  "ios_store_url" VARCHAR(500),
  "android_store_url" VARCHAR(500),
  "whats_new" JSONB,
  "updated_by" UUID REFERENCES "users"("id") ON DELETE SET NULL,
  "updated_at" TIMESTAMP(6) NOT NULL DEFAULT (NOW() AT TIME ZONE 'UTC'),
  CONSTRAINT "app_settings_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "maintenance_windows" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "started_at" TIMESTAMP(6) NOT NULL DEFAULT (NOW() AT TIME ZONE 'UTC'),
  "back_by" TIMESTAMP(6),
  "message" VARCHAR(280),
  "reason" VARCHAR(280),
  "started_by" UUID REFERENCES "users"("id") ON DELETE SET NULL,
  "ended_at" TIMESTAMP(6),
  "ended_by" UUID REFERENCES "users"("id") ON DELETE SET NULL,
  "paused_seconds" INTEGER,
  "auctions_extended" INTEGER,
  CONSTRAINT "maintenance_windows_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "maintenance_windows_end_after_start" CHECK ("ended_at" IS NULL OR "ended_at" >= "started_at")
);
CREATE INDEX "idx_maintenance_windows_started" ON "maintenance_windows" ("started_at" DESC);
-- Only one window can be open at a time; a second "start" fails instead of stacking pauses.
CREATE UNIQUE INDEX "maintenance_windows_one_open" ON "maintenance_windows" ((true)) WHERE "ended_at" IS NULL;
