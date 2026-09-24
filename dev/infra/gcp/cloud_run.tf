# Dedicated least-privilege runtime identity
resource "google_service_account" "api" {
  account_id   = "cloud-run-api"
  display_name = "Cloud Run api runtime (least privilege)"
}

# Holds the OTLP Authorization header (e.g. Grafana Cloud "Basic <base64>").
# tofu owns the container; the token version is added out-of-band via gcloud so
# the secret value never lands in tofu state (see terraform.tfvars.example).
resource "google_secret_manager_secret" "otlp_auth_header" {
  secret_id = "otlp-auth-header"

  replication {
    auto {}
  }

  depends_on = [google_project_service.secretmanager]
}

# The api runtime identity needs to read the header at container start.
resource "google_secret_manager_secret_iam_member" "api_otlp_auth" {
  secret_id = google_secret_manager_secret.otlp_auth_header.secret_id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.api.email}"
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

      # Trace export config, wired only when var.otlp_endpoint is set. The Rust
      # api treats a missing OTEL_EXPORTER_OTLP_ENDPOINT as "stdout logs only",
      # so an empty endpoint leaves both env vars off.
      dynamic "env" {
        for_each = var.otlp_endpoint == "" ? [] : [var.otlp_endpoint]
        content {
          name  = "OTEL_EXPORTER_OTLP_ENDPOINT"
          value = env.value
        }
      }

      dynamic "env" {
        for_each = var.otlp_endpoint == "" ? [] : [google_secret_manager_secret.otlp_auth_header.secret_id]
        content {
          name = "OTEL_EXPORTER_OTLP_HEADERS"
          value_source {
            secret_key_ref {
              secret  = env.value
              version = "latest"
            }
          }
        }
      }

      resources {
        limits = {
          cpu    = "1000m"
          memory = "1Gi"
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

  # The IAM grant must exist before a revision references the secret, otherwise
  # the container fails to start while the runtime SA still lacks read access.
  depends_on = [
    google_project_service.run,
    google_secret_manager_secret_iam_member.api_otlp_auth,
  ]
}

# Identity the Cloudflare Worker uses to call the api. The Worker holds a key
# for this account (PARSE_API_SA_KEY) and mints ID tokens with it; see
# terraform.tfvars.example for how the key is created and rotated. It has no
# roles beyond run.invoker on the api service below.
resource "google_service_account" "worker_invoker" {
  account_id   = "worker-invoker"
  display_name = "Cloudflare Worker -> Cloud Run api invoker"
}

# Cloud Run is private by default. Only the Worker identity (plus any extra
# var.invoker_members) may call the service; Google rejects everyone else at
# its frontend, before a container starts.
#
# The Worker grant is its own resource, not an entry in the for_each below:
# for_each keys must be known at plan time, and the account email is not
# known until the service account exists.
resource "google_cloud_run_v2_service_iam_member" "worker_invoker" {
  name     = google_cloud_run_v2_service.api.name
  location = google_cloud_run_v2_service.api.location
  role     = "roles/run.invoker"
  member   = "serviceAccount:${google_service_account.worker_invoker.email}"
}

resource "google_cloud_run_v2_service_iam_member" "invokers" {
  for_each = toset(var.invoker_members)

  name     = google_cloud_run_v2_service.api.name
  location = google_cloud_run_v2_service.api.location
  role     = "roles/run.invoker"
  member   = each.value
}
