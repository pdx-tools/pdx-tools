resource "cloudflare_ruleset" "media_corp" {
  zone_id = var.cf_zone_id
  name    = "default"
  kind    = "zone"
  phase   = "http_response_headers_transform"

  rules = [{
    # Add CORP to public bucket as we use SharedArrayBuffer
    description = "Add corp to media.pdx.tools"
    expression  = "(http.host eq \"media.pdx.tools\")"
    action      = "rewrite"
    enabled     = true
    action_parameters = {
      headers = {
        "Cross-Origin-Resource-Policy" = {
          operation = "add"
          value     = "cross-origin"
        }
      }
    }
  }]
}
