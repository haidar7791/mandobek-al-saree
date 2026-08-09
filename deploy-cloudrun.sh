#!/usr/bin/env bash
# deploy-cloudrun.sh — Deploy forus-backend to Google Cloud Run
# Run from workspace root:  bash deploy-cloudrun.sh
set -euo pipefail

export PATH="$PATH:/home/runner/gcloud/google-cloud-sdk/bin"

PROJECT="mandobek-al-saree"
REGION="europe-west1"
SERVICE="forus-backend"
REPO="forus-backend"
IMAGE="$REGION-docker.pkg.dev/$PROJECT/$REPO/$SERVICE"
SA="firebase-adminsdk-fbsvc@$PROJECT.iam.gserviceaccount.com"

# ── 1. Authenticate ──────────────────────────────────────────────────────────
echo "🔑 Authenticating..."
echo "$FIREBASE_SERVICE_ACCOUNT" > /tmp/sa_key.json
gcloud auth activate-service-account --key-file=/tmp/sa_key.json --quiet
gcloud config set project "$PROJECT" --quiet
gcloud auth configure-docker "$REGION-docker.pkg.dev" --quiet
echo "   ✓ Authenticated"

# ── 2. Artifact Registry repo (idempotent) ────────────────────────────────────
echo "📦 Ensuring Artifact Registry repo..."
gcloud artifacts repositories create "$REPO" \
  --repository-format=docker \
  --location="$REGION" \
  --project="$PROJECT" \
  --quiet 2>/dev/null && echo "   ✓ Repo created" || echo "   ✓ Repo exists"

# ── 3. Build & Push ───────────────────────────────────────────────────────────
if [[ "${SKIP_BUILD:-0}" != "1" ]]; then
  echo "🐳 Building Docker image..."
  docker build -t "$IMAGE:latest" .
  echo "   ✓ Image built"
  echo "📤 Pushing image..."
  docker push "$IMAGE:latest"
  echo "   ✓ Image pushed"
else
  echo "⏭  Skipping build (SKIP_BUILD=1) — using existing image"
fi

# ── 4. Write env-vars YAML (json.dumps → valid YAML double-quoted scalars) ────
echo "🔐 Writing env-vars file..."
python3 - <<PYEOF
import json, os

def q(v):
    """json.dumps produces a valid YAML double-quoted scalar."""
    return json.dumps(str(v))

lines = [
    "NODE_ENV: " + q("production"),
    "WHATSAPP_PHONE_NUMBER_ID: " + q(os.environ.get("WHATSAPP_PHONE_NUMBER_ID", "")),
    "WHATSAPP_ACCESS_TOKEN: "    + q(os.environ.get("WHATSAPP_ACCESS_TOKEN",    "")),
    "FIREBASE_SERVICE_ACCOUNT: " + q(os.environ["FIREBASE_SERVICE_ACCOUNT"]),
    "SESSION_SECRET: "           + q(os.environ["SESSION_SECRET"]),
    "EMAIL_USER: "               + q(os.environ["EMAIL_USER"]),
    "EMAIL_PASS: "               + q(os.environ["EMAIL_PASS"]),
]

with open("/tmp/cr-env.yaml", "w") as f:
    f.write("\n".join(lines) + "\n")

print("   ✓ /tmp/cr-env.yaml written")
PYEOF

# ── 5. Deploy to Cloud Run ────────────────────────────────────────────────────
echo "🚀 Deploying to Cloud Run ($REGION)..."
gcloud run deploy "$SERVICE" \
  --image="$IMAGE:latest" \
  --project="$PROJECT" \
  --region="$REGION" \
  --platform=managed \
  --allow-unauthenticated \
  --service-account="$SA" \
  --port=8080 \
  --memory=512Mi \
  --cpu=1 \
  --min-instances=0 \
  --max-instances=10 \
  --env-vars-file=/tmp/cr-env.yaml \
  --quiet

# ── 6. Get live URL ───────────────────────────────────────────────────────────
SERVICE_URL=$(gcloud run services describe "$SERVICE" \
  --project="$PROJECT" \
  --region="$REGION" \
  --format="value(status.url)")

HOST=$(echo "$SERVICE_URL" | sed 's|https://||')
echo "$HOST" > /tmp/cr_host.txt

echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║  ✅  Cloud Run deployment complete!                          ║"
printf "║  🌐  %-55s ║\n" "$SERVICE_URL"
echo "╚══════════════════════════════════════════════════════════════╝"
echo "BACKEND_HOST=$HOST"

rm -f /tmp/sa_key.json /tmp/cr-env.yaml
