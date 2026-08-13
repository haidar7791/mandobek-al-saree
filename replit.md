# فورس (ForUs)

An Arabic-language React Native / Expo mobile app — a service marketplace connecting customers with artisans/service providers. Built with Expo Router (file-based routing), an Express backend, and Firebase for auth and Firestore data.

## Stack

- **Frontend**: React Native + Expo (SDK 54), Expo Router v6, React Query
- **Backend**: Express 5 (TypeScript via `tsx`), served on port 5000
- **Auth / Data**: Firebase (Firestore + Firebase Auth)
- **Push notifications**: Expo Notifications + Firebase FCM

## Running on Replit

| Workflow | Command | Port |
|---|---|---|
| Start Backend | `npm run server:dev` | 5000 |
| Start Frontend | `npm run expo:dev` | 8081 |

The backend serves a landing page at port 5000 with a QR code. Scan it with **Expo Go** on your phone to preview the app, or press `w` in the Expo terminal to open the web version.

## Key files

- `app/` — Expo Router screens (login, register, dashboard, chat, wallet, admin, etc.)
- `server/` — Express backend (routes, storage, email templates)
- `app.json` — Expo / EAS config (app name, bundle IDs, plugins)
- `assets/images/` — App icons and splash screen

## Notes

- The `google-services.json` (Firebase Android config) must be present at the repo root for Android builds. It is gitignored — add it before running `eas build`.
- Firebase config is embedded inside the app screens via Firebase SDK initialisation — update it there if you switch Firebase projects.
- package-lock.json should not be committed (see `.gitignore`) — it picks up Replit-specific resolved URLs that break EAS builds.
- Backend admin routes that use Firebase Admin require the `FIREBASE_SERVICE_ACCOUNT` secret. The frontend and standard development preview run without it.
- External sharing uses the registered `forus://product/<id>`, `forus://user/<id>`, and `forus://profile/<id>` deep-link formats, with an HTTPS fallback for recipients without the app.

## User Preferences
