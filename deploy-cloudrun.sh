#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# deploy-cloudrun.sh — Deploy forus-backend to Google Cloud Run
#
# Run from the workspace root after granting IAM roles:
#   bash deploy-cloudrun.sh
#
# Required IAM roles on firebase-adminsdk-fbsvc@mandobek-al-saree.iam.gserviceaccount.com:
#   roles/run.admin
#   roles/artifactregistry.admin
#   roles/iam.serviceAccountUser
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

export PATH="$PATH:/home/runner/gcloud/google-cloud-sdk/bin"

PROJECT="mandobek-al-saree"
REGION="europe-west1"
SERVICE="forus-backend"
REPO="forus-backend"
IMAGE="$REGION-docker.pkg.dev/$PROJECT/$REPO/$SERVICE"
SA="firebase-adminsdk-fbsvc@$PROJECT.iam.gserviceaccount.com"

# ── 1. Authenticate ──────────────────────────────────────────────────────────
echo "🔑 Authenticating with service account..."
echo "$FIREBASE_SERVICE_ACCOUNT" > /tmp/sa_key.json
gcloud auth activate-service-account --key-file=/tmp/sa_key.json --quiet
gcloud config set project "$PROJECT" --quiet
gcloud auth configure-docker "$REGION-docker.pkg.dev" --quiet
echo "   ✓ Authenticated as $SA"

# ── 2. Create Artifact Registry repo (idempotent) ────────────────────────────
echo "📦 Ensuring Artifact Registry repository exists..."
gcloud artifacts repositories create "$REPO" \
  --repository-format=docker \
  --location="$REGION" \
  --project="$PROJECT" \
  --quiet 2>/dev/null && echo "   ✓ Repository created" \
  || echo "   ✓ Repository already exists"

# ── 3. Build Docker image ─────────────────────────────────────────────────────
echo "🐳 Building Docker image..."
docker build -t "$IMAGE:latest" .
echo "   ✓ Image built"

# ── 4. Push to Artifact Registry ─────────────────────────────────────────────
echo "📤 Pushing image to Artifact Registry..."
docker push "$IMAGE:latest"
echo "   ✓ Image pushed"

# ── 5. Read Replit secrets from environment ───────────────────────────────────
# Secrets are already available as env vars in the Replit shell.
# We pass them as Cloud Run env vars so the server can read process.env.*
FIREBASE_SA_ESCAPED=$(echo "$FIREBASE_SERVICE_ACCOUNT" | python3 -c "import sys,json; print(json.dumps(sys.stdin.read().strip()))" | tr -d '"')

# ── 6. Deploy to Cloud Run ────────────────────────────────────────────────────
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
  --set-env-vars="NODE_ENV=production" \
  --set-env-vars="ULTRAMSG_INSTANCE_ID=${ULTRAMSG_INSTANCE_ID:-instance187756}" \
  --set-env-vars="ULTRAMSG_TOKEN=${ULTRAMSG_TOKEN:-us2d3muaswe5s4kp}" \
  --update-env-vars="FIREBASE_SERVICE_ACCOUNT=${FIREBASE_SERVICE_ACCOUNT}" \
  --update-env-vars="SESSION_SECRET=${SESSION_SECRET}" \
  --update-env-vars="EMAIL_USER=${EMAIL_USER}" \
  --update-env-vars="EMAIL_PASS=${EMAIL_PASS}" \
  --quiet

# ── 7. Print the live URL ─────────────────────────────────────────────────────
SERVICE_URL=$(gcloud run services describe "$SERVICE" \
  --project="$PROJECT" \
  --region="$REGION" \
  --format="value(status.url)")

echo ""
echo "╔════════════════════════════════════════════════════════════╗"
echo "║  ✅ Cloud Run deployment complete!                         ║"
echo "╠════════════════════════════════════════════════════════════╣"
printf "║  🌐 URL: %-51s║\n" "$SERVICE_URL"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""
echo "Next step: update REPLIT_BACKEND_HOST in the app to:"
echo "  $(echo "$SERVICE_URL" | sed 's|https://||')"

# Cleanup
rm -f /tmp/sa_key.json
