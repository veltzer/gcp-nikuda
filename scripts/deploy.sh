#!/bin/bash -eu

# Deploy the nikuda app to Cloud Run. Replaces the GAE gcloud_deploy.sh
# flow: Cloud Run keeps revision history itself and routes all traffic to
# the new revision on deploy, so there is no version cleanup to do.

cd "$(dirname "${0}")/.."

# Use the gcloud configuration this repo declares in .gcp.conf.
source .gcp.conf
export CLOUDSDK_ACTIVE_CONFIG_NAME="${gcp_configuration_name}"

SERVICE="nikuda"
REGION="us-central1"

# Stamp what is about to be deployed so the app can serve it back via
# app/version. The Cloud Run revision name is not known before the deploy;
# the app reads it at runtime from the K_REVISION env var instead.
jq -n \
	--arg deploy_date "$(date --utc --iso-8601=seconds)" \
	--arg git_describe "$(git describe --always --dirty --tags)" \
	'{deploy_date: $deploy_date, git_describe: $git_describe}' > build_info.json

gcloud run deploy "${SERVICE}" \
	--source . \
	--region "${REGION}" \
	--allow-unauthenticated \
	--max-instances 2 \
	--quiet
