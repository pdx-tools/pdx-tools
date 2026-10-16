# Hyperdrive config fronting the for PDX_DB

resource "cloudflare_hyperdrive_config" "pdx_db" {
  account_id              = var.cf_account_id
  name                    = "pdx-db"
  origin_connection_limit = 60

  origin = {
    host     = "db.pdx.tools"
    port     = 5432
    database = "postgres"
    user     = "app_user"
    scheme   = "postgresql"
    password = var.hyperdrive_password
  }

  caching = {
    disabled = false
  }

  mtls = {}

  lifecycle {
    ignore_changes = [origin.password]
  }
}

# Hyperdrive config for pull request previews. It connects as app_preview, a
# role that can only read (see src/app/migrations/0009_preview_grants.sql).
# Caching stays off so that a preview does not depend on cache behavior.
resource "cloudflare_hyperdrive_config" "pdx_db_preview" {
  account_id              = var.cf_account_id
  name                    = "pdx-db-preview"
  origin_connection_limit = 5

  origin = {
    host     = "db.pdx.tools"
    port     = 5432
    database = "postgres"
    user     = "app_preview"
    scheme   = "postgresql"
    password = var.hyperdrive_preview_password
  }

  caching = {
    disabled = true
  }

  mtls = {}

  lifecycle {
    ignore_changes = [origin.password]
  }
}

output "pdx_db_preview_hyperdrive_id" {
  description = "Hyperdrive ID for env.preview in src/app/wrangler.toml."
  value       = cloudflare_hyperdrive_config.pdx_db_preview.id
}
