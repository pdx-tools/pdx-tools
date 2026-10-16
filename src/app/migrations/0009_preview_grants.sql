-- Grant new users columns explicitly. Keep email and api_key private.
--
-- Enable login only in production:
--
--   ALTER ROLE app_preview WITH LOGIN PASSWORD '...';
--
-- Grants enforce read-only access because clients can change
-- default_transaction_read_only.
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'app_preview') THEN
    CREATE ROLE app_preview NOLOGIN;
  END IF;
END
$$;--> statement-breakpoint
ALTER ROLE app_preview SET default_transaction_read_only = on;--> statement-breakpoint
GRANT USAGE ON SCHEMA public TO app_preview;--> statement-breakpoint
GRANT SELECT ON ALL TABLES IN SCHEMA public TO app_preview;--> statement-breakpoint
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO app_preview;--> statement-breakpoint
REVOKE SELECT ON "users" FROM app_preview;--> statement-breakpoint
GRANT SELECT ("user_id", "steam_id", "steam_name", "account", "display", "created_on", "features") ON "users" TO app_preview;
