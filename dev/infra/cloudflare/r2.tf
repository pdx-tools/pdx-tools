resource "cloudflare_r2_bucket" "saves" {
  account_id = var.cf_account_id
  name       = "pdx-saves"

  lifecycle {
    prevent_destroy = true
  }
}

resource "cloudflare_r2_bucket" "media" {
  account_id = var.cf_account_id
  name       = "pdx-media"

  lifecycle {
    prevent_destroy = true
  }
}

# Test buckets — no prevent_destroy, no precious data.
resource "cloudflare_r2_bucket" "saves_test" {
  account_id = var.cf_account_id
  name       = "pdx-saves-test"
}

resource "cloudflare_r2_bucket" "media_test" {
  account_id = var.cf_account_id
  name       = "pdx-media-test"
}
