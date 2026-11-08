# Custom WAF rules live in the http_request_firewall_custom phase (one ruleset
# per zone per phase). Managed by the "Zone WAF" zone token permission.
resource "cloudflare_ruleset" "firewall_custom" {
  zone_id = var.cf_zone_id
  name    = "default"
  kind    = "zone"
  phase   = "http_request_firewall_custom"

  rules = [{
    # The site has no PHP or WordPress. Stop the scanners at the edge so that
    # they do not use worker requests.
    description = "Block PHP and WordPress probes"
    expression  = "(http.host eq \"pdx.tools\" and (ends_with(http.request.uri.path, \".php\") or starts_with(http.request.uri.path, \"/wp-\")))"
    action      = "block"
    enabled     = true
  }]
}
