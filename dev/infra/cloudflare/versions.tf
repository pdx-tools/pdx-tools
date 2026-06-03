terraform {
  required_version = ">= 1.8"

  required_providers {
    cloudflare = {
      source  = "cloudflare/cloudflare"
      version = "~> 5"
    }
  }


  backend "s3" {
    bucket                      = "pdx-tofu-state"
    key                         = "cloudflare/terraform.tfstate"
    region                      = "auto"
    endpoints                   = { s3 = "https://370cca34ba6526e39db6c5ca42550085.r2.cloudflarestorage.com" }
    skip_credentials_validation = true
    skip_region_validation      = true
    skip_requesting_account_id  = true
    skip_s3_checksum            = true
    use_path_style              = true
    use_lockfile                = true
  }
}

# Reads CLOUDFLARE_API_TOKEN from the environment — never commit the token.
provider "cloudflare" {}
