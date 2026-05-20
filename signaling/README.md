# @teamdesk/signaling

Standalone Socket.IO signaling for TeamDesk. Deployed on Cloud Run; the web
app (Firebase App Hosting) connects to it via `NEXT_PUBLIC_SIGNALING_URL`.

The room/relay logic lives in `server.ts` (`attachSignaling`) and is reused
by the root `server.ts` for local dev — same code, different entry point.

## Deploy to Cloud Run

```bash
# from this directory
gcloud config set project studio-3136369715-93de6

gcloud run deploy teamdesk-signaling \
  --source . \
  --region us-central1 \
  --allow-unauthenticated \
  --port 8080 \
  --set-env-vars CORS_ORIGIN=*
```

Cloud Run will build the Dockerfile, push the image to Artifact Registry,
and give you back a URL like:

```
https://teamdesk-signaling-xxxxxxxxxx-uc.a.run.app
```

Stick that into the web app's env as `NEXT_PUBLIC_SIGNALING_URL`.

## Lock CORS to the production web URL

Once App Hosting gives you the web app URL, redeploy with:

```bash
gcloud run services update teamdesk-signaling \
  --region us-central1 \
  --set-env-vars CORS_ORIGIN=https://<your-app-hosting-domain>
```

## Local

```bash
npm install
npm run dev    # listens on :8080
```

Health check: `curl http://localhost:8080/healthz` → `ok`.
