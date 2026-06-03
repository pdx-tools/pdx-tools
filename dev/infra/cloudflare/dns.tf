# tofu owns only hand-edited records with no other control plane.
#
#   - pdx.tools AAAA (100::)        owned by the Workers custom domain (workers.tf)
#   - media.pdx.tools CNAME         owned by the R2 custom domain (infra:cf:media-domain:*)
#   - MX/SPF/DKIM/DMARC records     auto-managed by Email Routing (email.tf)
#
# ttl = 1 is "automatic" (required for proxied records). `name` is the full
# record name in provider v5.

resource "cloudflare_dns_record" "txt_google_verify" {
  zone_id = var.cf_zone_id
  name    = "pdx.tools"
  type    = "TXT"
  content = "google-site-verification=8wByTf3CFNvlXGb5NpD_6QuZMPAOCS32xbgi3YIAvLU"
  proxied = false
  ttl     = 1
}

resource "cloudflare_dns_record" "app" {
  zone_id = var.cf_zone_id
  name    = "app.pdx.tools"
  type    = "A"
  content = var.vps_origin_ip
  proxied = false
  ttl     = 1
}

resource "cloudflare_dns_record" "db" {
  zone_id = var.cf_zone_id
  name    = "db.pdx.tools"
  type    = "A"
  content = var.vps_origin_ip
  proxied = false
  ttl     = 1
}

resource "cloudflare_dns_record" "maets" {
  zone_id = var.cf_zone_id
  name    = "maets.pdx.tools"
  type    = "A"
  content = var.vps_origin_ip
  proxied = false
  ttl     = 1
}

# B2 CDN origin.
resource "cloudflare_dns_record" "cdn_dev" {
  zone_id = var.cf_zone_id
  name    = "cdn-dev.pdx.tools"
  type    = "CNAME"
  content = "f002.backblazeb2.com"
  proxied = true
  ttl     = 1
}

resource "cloudflare_dns_record" "jomini" {
  zone_id = var.cf_zone_id
  name    = "jomini.pdx.tools"
  type    = "CNAME"
  content = "jomini.rakaly.workers.dev"
  proxied = true
  ttl     = 1
}

resource "cloudflare_dns_record" "txt_github_challenge" {
  zone_id = var.cf_zone_id
  name    = "_github-challenge-pdx-tools.pdx.tools"
  type    = "TXT"
  content = "c386586c69"
  proxied = false
  ttl     = 1
}
