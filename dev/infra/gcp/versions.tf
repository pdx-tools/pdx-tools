terraform {
  required_version = ">= 1.8"

  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 6"
    }
  }


  backend "s3" {
    bucket                      = "pdx-tofu-state"
    key                         = "gcp/terraform.tfstate"
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

# Reads Application Default Credentials from the environment
# (gcloud auth application-default login) — never commit a key file.
provider "google" {
  project = var.gcp_project
}
