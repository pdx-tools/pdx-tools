variable "gcp_project" {
  description = "GCP project ID that owns Artifact Registry and Cloud Run (already public as GCLOUD_PROJECT in .env)."
  type        = string
  default     = "i-hexagon-388212"
}

variable "artifact_region" {
  description = "Region for the Artifact Registry Docker repository."
  type        = string
  default     = "us-west1"
}

variable "run_region" {
  description = "Region for the Cloud Run api service."
  type        = string
  default     = "us-west2"
}

variable "invoker_members" {
  description = "IAM members granted roles/run.invoker on the api service (set from the live policy — see README)."
  type        = list(string)
  default     = []
}

variable "otlp_endpoint" {
  description = <<-EOT
    OTLP/HTTP endpoint for exporting api traces (e.g. Grafana Cloud Tempo:
    https://otlp-gateway-<region>.grafana.net/otlp). Leave empty to disable
    trace export — the api then only logs to stdout. When set, the api container
    also gets OTEL_EXPORTER_OTLP_HEADERS sourced from the otlp-auth-header secret;
    add the token first (see terraform.tfvars.example) or Cloud Run will fail to
    start on a secret with no version.
  EOT
  type        = string
  default     = ""
}
