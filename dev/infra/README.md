# Infra

## What tofu owns (and doesn't)

tofu owns resources wrangler can't manage: bucket existence, the
CORP transform rule, DNS, Worker hostname mappings, Hyperdrive, Email Routing.

## Setup

Provide Cloudflare credentials and IDs (the shared state keys above are also
required):

```sh
cp cloudflare/cf.local.env.example cloudflare/cf.local.env   # fill in CLOUDFLARE_API_TOKEN + ZONE_ID
cp cloudflare/terraform.tfvars.example cloudflare/terraform.tfvars   # fill in IDs + secrets
mise run infra:cf:init
```

## Making a change

```sh
mise run infra:cf:change   # fmt check + validate + plan
mise run infra:cf:apply    # backs up state first, then applies
```

## Disaster recovery

Resources already exist in the cloud — `tofu apply` recreates them only on a
clean account. To rebuild:

1. `wrangler r2 bucket create pdx-tofu-state`, restore the latest `backups/`
   snapshot, then `mise run infra:cf:init`.
2. `mise run infra:cf:apply` to recreate buckets/rules (drop `prevent_destroy`
   only if you really mean to recreate prod buckets).
3. Re-attach the media domain: `mise run infra:cf:media-domain:attach`.

## GCP (`gcp/`)

tofu owns the Artifact Registry `docker` repo and the Cloud Run `api` service
config (resources, startup probe, and the `run.invoker` IAM the Cloudflare Worker
relies on via `PARSE_API_ENDPOINT`).

### Setup (one-time, maintainer)

GCP needs only the shared `state.local.env` (above) for the backend; provider
auth comes from Application Default Credentials, not an env file:

```sh
gcloud auth application-default login   # provider auth (ADC)
mise run infra:gcp:init
```

### Making a change

```sh
mise run infra:gcp:change   # fmt check + validate + plan
mise run infra:gcp:apply    # backs up state first, then applies
```
