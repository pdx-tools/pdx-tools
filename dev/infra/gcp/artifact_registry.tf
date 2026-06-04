resource "google_artifact_registry_repository" "docker" {
  location      = var.artifact_region
  repository_id = "docker"
  format        = "DOCKER"

  docker_config {
    immutable_tags = false
  }

  depends_on = [google_project_service.registry]
}
