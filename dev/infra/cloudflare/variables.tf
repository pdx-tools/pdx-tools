variable "cf_account_id" {
  description = "Cloudflare account ID that owns the R2 buckets and zone (set in terraform.tfvars)."
  type        = string
}

variable "cf_zone_id" {
  description = "Cloudflare zone ID for pdx.tools, hosts the CORP transform rule (set in terraform.tfvars)."
  type        = string
}

variable "vps_origin_ip" {
  description = "Origin server IP for the app/db/maets DNS records (set in terraform.tfvars)."
  type        = string
}

variable "hyperdrive_password" {
  description = "Placeholder for the Hyperdrive origin password; ignored by tofu (managed out of band)."
  type        = string
  sensitive   = true
  default     = "managed-out-of-band"
}

variable "email_forward_to" {
  description = "Destination email that routing rules forward to (set in terraform.tfvars)."
  type        = string
  sensitive   = true
}
