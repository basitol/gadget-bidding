-- Per-user alert switches from the app's Settings screen.
ALTER TABLE "users" ADD COLUMN "notification_prefs" JSONB;
