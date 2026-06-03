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
