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
