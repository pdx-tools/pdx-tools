# URL Rewrite lives in the http_request_transform phase (one ruleset per zone
# per phase). Managed by the "Transform Rules" zone token permission.
# Note: $${1} escapes to a literal ${1} (wildcard capture), not tofu interpolation.
resource "cloudflare_ruleset" "rewrite" {
  zone_id = var.cf_zone_id
  name    = "default"
  kind    = "zone"
  phase   = "http_request_transform"

  rules = [{
    description = "Rewrite path of cdn-dev pdx.tools to b2 bucket"
    expression  = "(http.request.full_uri wildcard r\"https://cdn-dev.pdx.tools/*\")"
    action      = "rewrite"
    enabled     = true
    action_parameters = {
      uri = {
        path = {
          expression = "wildcard_replace(http.request.uri.path, r\"/*\", r\"/file/pdx-tools-public/$${1}\")"
        }
      }
    }
  }]
}
