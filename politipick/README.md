<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run the app locally

This is a Vite + React + Firebase app.

## Run Locally

**Prerequisites:** Node.js

1. Install dependencies: `npm install`
2. Verify Firebase web config in `firebase-applet-config.json` points at your project.
3. Start dev server: `npm run dev`
4. Open: `http://localhost:3000`

## Deploy Firestore Rules (required for tamper-resistance)

The security rules in `firestore.rules` must be deployed to your Firebase project.

- Login: `npx firebase-tools login`
- Deploy rules: `npx firebase-tools deploy --only firestore:rules --project politipiks`

## Make yourself an admin (to call results + score picks)

Admins are determined by the existence of a Firestore doc at `admins/<uid>`.

Options:
- Manual: Create `admins/<your-uid>` in the Firestore console (any fields are fine).
- Scripted (requires a service account JSON; do not commit it):
  - `npm run grant-admin -- --uid <UID> --service-account <path-to-service-account.json>`

## Real contest data (automated ingest)

For production, contests should be written by a backend ingest job (not by the client).

- Ingest service scaffold: `ingest/README.md`
- The UI can be developed against mock contests by setting `VITE_USE_MOCK_CONTESTS=true` (see `.env.example`).
- Quick start for free post-cert data: set `INGEST_SOURCE_TYPE=medsl2024` in the ingest service (see `ingest/README.md`).
