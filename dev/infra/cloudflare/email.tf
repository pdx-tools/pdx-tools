# Email routing rules + catch-all.

resource "cloudflare_email_routing_rule" "dmarc" {
  zone_id  = var.cf_zone_id
  name     = "Rule created at 2022-01-19T19:24:27.482Z"
  enabled  = true
  matchers = [{ type = "literal", field = "to", value = "dmarc@pdx.tools" }]
  actions  = [{ type = "forward", value = [var.email_forward_to] }]
}

resource "cloudflare_email_routing_rule" "hi" {
  zone_id  = var.cf_zone_id
  name     = "Rule created at 2022-01-19T12:05:18.639Z"
  enabled  = true
  matchers = [{ type = "literal", field = "to", value = "hi@pdx.tools" }]
  actions  = [{ type = "forward", value = [var.email_forward_to] }]
}

resource "cloudflare_email_routing_rule" "billing" {
  zone_id  = var.cf_zone_id
  name     = "Rule created at 2022-01-19T12:03:44.360Z"
  enabled  = true
  matchers = [{ type = "literal", field = "to", value = "billing@pdx.tools" }]
  actions  = [{ type = "forward", value = [var.email_forward_to] }]
}

# Catch-all: disabled, drops anything not matched by a rule above.
resource "cloudflare_email_routing_catch_all" "this" {
  zone_id  = var.cf_zone_id
  name     = ""
  enabled  = false
  matchers = [{ type = "all" }]
  actions  = [{ type = "drop" }]
}
