-- app_preview is the role of pull request previews. It can read all tables
-- except the email and api_key columns of users. When you add a users column
-- that previews must read, grant it in the same migration.
--
-- The role cannot log in until you give it a password, which you do only on
-- production:
--
--   ALTER ROLE app_preview WITH LOGIN PASSWORD '...';
--
-- The grants are the boundary, because a client can change
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
