# Infra

All infra tasks live in the `infra` mise environment, so run them with
`mise --env infra run ...` (or `MISE_ENV=infra`). This is deliberate: the
environment loads `state.local.env` / `cf.local.env`, and gating it keeps those
credentials out of unrelated commands like `mise run release:build`. You can
instead opt in persistently via `.config/miserc.toml` (`env = ["infra"]`), but
then the infra credentials apply to every mise invocation — including releases,
where `CLOUDFLARE_API_TOKEN` will interfere — so prefer the per-command form.

## What tofu owns (and doesn't)

tofu owns resources wrangler can't manage: bucket existence, the
CORP transform rule, DNS, Worker hostname mappings, Hyperdrive, Email Routing.

## Setup

Provide Cloudflare credentials and IDs (the shared state keys above are also
required):

```sh
cp cloudflare/cf.local.env.example cloudflare/cf.local.env   # fill in CLOUDFLARE_API_TOKEN + ZONE_ID
cp cloudflare/terraform.tfvars.example cloudflare/terraform.tfvars   # fill in IDs + secrets
mise --env infra run infra:cf:init
```

## Making a change

```sh
mise --env infra run infra:cf:change   # fmt check + validate + plan
mise --env infra run infra:cf:apply    # backs up state first, then applies
```

## Disaster recovery

Resources already exist in the cloud — `tofu apply` recreates them only on a
clean account. To rebuild:

1. `wrangler r2 bucket create pdx-tofu-state`, restore the latest `backups/`
   snapshot, then `mise --env infra run infra:cf:init`.
2. `mise --env infra run infra:cf:apply` to recreate buckets/rules (drop `prevent_destroy`
   only if you really mean to recreate prod buckets).
3. Re-attach the media domain: `mise --env infra run infra:cf:media-domain:attach`.

## GCP (`gcp/`)

tofu owns the Artifact Registry `docker` repo and the Cloud Run `api` service
config (resources, startup probe, and the `run.invoker` IAM the Cloudflare Worker
relies on via `PARSE_API_ENDPOINT`).

### Setup (one-time, maintainer)

GCP needs only the shared `state.local.env` (above) for the backend; provider
auth comes from Application Default Credentials, not an env file:

```sh
gcloud auth application-default login   # provider auth (ADC)
mise --env infra run infra:gcp:init
```

### Making a change

```sh
mise --env infra run infra:gcp:change   # fmt check + validate + plan
mise --env infra run infra:gcp:apply    # backs up state first, then applies
```
