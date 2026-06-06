# Dedicated least-privilege runtime identity
resource "google_service_account" "api" {
  account_id   = "cloud-run-api"
  display_name = "Cloud Run api runtime (least privilege)"
}

# The EU4 parse / screenshot backend. The Cloudflare Worker reaches this service
# via PARSE_API_ENDPOINT. tofu owns the service config (resources, probe, IAM);
# `gcloud run deploy` (admin:release) owns the deployed image — hence the
# ignore_changes on the image below, so nightly pushes don't show up as drift.
resource "google_cloud_run_v2_service" "api" {
  name     = "api"
  location = var.run_region

  template {
    service_account = google_service_account.api.email

    containers {
      name  = "api-1"
      image = "${var.artifact_region}-docker.pkg.dev/${var.gcp_project}/docker/api:nightly"

      ports {
        container_port = 8080
      }

      resources {
        limits = {
          cpu    = "1000m"
          memory = "512Mi"
        }
        cpu_idle          = true
        startup_cpu_boost = true
      }

      startup_probe {
        http_get {
          path = "/healthz"
          port = 8080
        }
        timeout_seconds   = 3
        period_seconds    = 3
        failure_threshold = 10
      }

      liveness_probe {
        http_get {
          path = "/healthz"
          port = 8080
        }
        timeout_seconds   = 5
        period_seconds    = 10
        failure_threshold = 3
      }
    }
  }

  lifecycle {
    ignore_changes = [
      template[0].containers[0].image, # gcloud run deploy owns the deployed tag
      client,
      client_version,
    ]
  }

  depends_on = [google_project_service.run]
}

# Cloud Run is private by default. The Worker calls PARSE_API_ENDPOINT
# unauthenticated, so the service must grant run.invoker to allUsers
resource "google_cloud_run_v2_service_iam_member" "invokers" {
  for_each = toset(var.invoker_members)

  name     = google_cloud_run_v2_service.api.name
  location = google_cloud_run_v2_service.api.location
  role     = "roles/run.invoker"
  member   = each.value
}
