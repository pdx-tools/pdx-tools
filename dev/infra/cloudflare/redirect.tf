# A zone allows only one ruleset per phase, so this single resource owns every
# Single Redirect (CF product name for the http_request_dynamic_redirect phase).
# Editing it requires the "Single Redirect" zone token permission.
resource "cloudflare_ruleset" "redirects" {
  zone_id = var.cf_zone_id
  name    = "default"
  kind    = "zone"
  phase   = "http_request_dynamic_redirect"

  rules = [
    {
      # Pre-existing, intentionally disabled; adopted into tofu on import.
      description = "dev redirect"
      expression  = "(http.host eq \"dev.pdx.tools\")"
      action      = "redirect"
      enabled     = false
      action_parameters = {
        from_value = {
          status_code           = 301
          preserve_query_string = false
          target_url = {
            value = "https://pdx.tools"
          }
        }
      }
    },
    {
      description = "Redirect www.pdx.tools to apex"
      expression  = "(http.host eq \"www.pdx.tools\")"
      action      = "redirect"
      enabled     = true
      action_parameters = {
        from_value = {
          status_code           = 301
          preserve_query_string = true
          target_url = {
            expression = "concat(\"https://pdx.tools\", http.request.uri.path)"
          }
        }
      }
    },
  ]
}
