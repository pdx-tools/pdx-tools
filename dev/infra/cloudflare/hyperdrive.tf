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

# Database grants restrict app_preview to reads.
# See src/app/migrations/0009_preview_grants.sql.
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
    # Read current database values in previews.
    disabled = true
  }

  mtls = {}

  lifecycle {
    ignore_changes = [origin.password]
  }
}

output "pdx_db_preview_hyperdrive_id" {
  description = "Hyperdrive ID for previews.hyperdrive in src/app/wrangler.toml."
  value       = cloudflare_hyperdrive_config.pdx_db_preview.id
}
