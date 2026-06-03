# Hostname -> Worker mappings

resource "cloudflare_workers_route" "jomini" {
  zone_id = var.cf_zone_id
  pattern = "jomini.pdx.tools/*"
  script  = "jomini"
}

resource "cloudflare_workers_custom_domain" "app" {
  account_id = var.cf_account_id
  hostname   = "pdx.tools"
  service    = "pdx-tools-workers"
}
