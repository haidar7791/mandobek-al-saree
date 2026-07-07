# Mandobek Al-Saree

A React Native / Expo mobile marketplace app with an Express backend. The app connects service artisans with customers — supporting orders, chat, wallet, admin dashboard, and push notifications.

## Stack

- **Frontend**: React Native + Expo (expo-router), targets iOS / Android / Web
- **Backend**: Express 5 (TypeScript, `tsx`)  
- **Database**: PostgreSQL via Drizzle ORM (`shared/schema.ts`)
- **Auth**: Firebase (phone verification + reCAPTCHA)
- **Real-time**: WebSockets (`ws`)

## Running on Replit

Two workflows run in parallel:

| Workflow | Command | Port |
|---|---|---|
| Start Backend | `npm run server:dev` | 5000 |
| Start Frontend | `npm run expo:dev` | 8081 |

The backend serves the Express API on port 5000.  
The Expo Metro bundler runs on port 8081 — scan the QR code with **Expo Go** on a device, or press `w` to open the web preview.

## Environment

- `DATABASE_URL` — auto-injected by Replit (PostgreSQL, runtime-managed)
- Firebase config — public keys set as `EXPO_PUBLIC_FIREBASE_*` in `.replit` `[userenv.shared]`
- `SESSION_SECRET` — set as a Replit Secret

## Database

Schema lives in `shared/schema.ts`. Apply changes with:

```
npm run db:push
```

## Project structure

```
app/          Expo Router screens (login, dashboard, chat, wallet, …)
components/   Shared React Native components
server/       Express backend (index.ts, routes.ts, storage.ts)
shared/       Drizzle schema + shared types
assets/       Images and fonts
```

## User preferences
