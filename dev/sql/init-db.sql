-- The roles of the production database. Names and passwords come from the
-- environment.

\set ON_ERROR_STOP on
\getenv app_user DATABASE_APP_USER
\getenv app_password DATABASE_APP_USER_PASSWORD
\getenv backup_password DATABASE_BACKUP_PASSWORD

CREATE ROLE db_backup WITH LOGIN PASSWORD :'backup_password';
ALTER DEFAULT PRIVILEGES
FOR USER postgres
IN SCHEMA public
GRANT SELECT ON TABLES TO db_backup;

CREATE ROLE :"app_user" WITH LOGIN PASSWORD :'app_password';
ALTER DEFAULT PRIVILEGES
FOR USER postgres
IN SCHEMA public
GRANT SELECT, UPDATE, INSERT, DELETE ON TABLES TO :"app_user";
