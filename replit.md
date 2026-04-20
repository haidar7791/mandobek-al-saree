# سند (Sanad) — Home & Car Services App

## Overview
"سند" is an Arabic RTL mobile app built with **Expo (React Native)** for the Iraqi market. It connects clients with nearby artisans (craftsmen) for home services, car services, and general services.

## Tech Stack
- **Frontend**: React Native (Expo SDK 54), Expo Router (file-based routing)
- **Backend**: Node.js Express server (port 5000) — serves landing page and API
- **Database**: Firebase Firestore (real-time DB for all app data)
- **Auth**: Firebase Authentication
- **Styling**: Cairo font (Arabic), LinearGradient, Reanimated animations
- **Location**: expo-location (GPS for nearest artisan discovery)

## App Structure
```
app/
  index.tsx          — Welcome/landing screen with سند branding
  login.tsx          — Login (email or phone → @sanad.app)
  register.tsx       — Register with role selection (زبون/حرفي) + specialty + GPS
  dashboard.tsx      — Main screen: category tabs + artisan cards sorted by distance
  artisan-profile.tsx — Artisan detail: call, WhatsApp, chat, ratings, service booking
  chat.tsx           — In-app real-time messaging (Firebase)
  wallet.tsx         — Wallet: deposit/withdrawal for ad credits (admin-approved)
  profile.tsx        — User profile management
  admin-dashboard.tsx — Admin: approve/reject wallet requests
  admin.tsx          — Admin access screen
lib/
  firebase.ts        — Firebase config (mandobek-al-saree Firebase project)
  db_logic.ts        — All Firestore operations (artisans, reviews, service requests, chat, wallet)
  query-client.ts    — React Query client
server/
  index.ts           — Express server entry
  routes.ts          — API routes
```

## Key Firebase Collections
- `users` — user profiles (name, phone, photoUri, role: client|artisan|admin, location, specialty)
- `artisans` — artisan profiles (specialty, category, location, rating, reviewCount, isAvailable)
- `reviews` — artisan reviews (rating 1-5, comment, clientId, artisanId)
- `serviceRequests` — service requests from clients to artisans (no financial deductions)
- `chats/{chatId}/messages` — in-app chat messages
- `wallets` — user wallet balances (for ad credits only)
- `walletRequests` — deposit/withdrawal requests (admin-approved by حيدر العسكري)

## Service Categories
- **خدمات المنزل**: سباك، كهربائي، نجار، دهّان، بنّاء، سيراميك، حداد، فيتر مكيفات
- **خدمات السيارات**: ميكانيكي، كهرباء سيارات، كاوتش، تصليح بودي، مكيف سيارة
- **خدمات عامة**: تنظيف منازل، نقل عفش، مكافحة حشرات، مولدات كهرباء، دشات وأنظمة

## Workflows
- **Start Backend**: `npm run server:dev` (port 5000)
- **Start Frontend**: `npm run expo:dev` (port 8081)

## Business Rules
- No unique codes, no insurance deductions — service requests are free
- Wallet is ONLY for ad payment credits
- All wallet top-ups require admin approval (حيدر العسكري)
- Artisans sorted by GPS distance on dashboard
- RTL (Arabic) layout enforced globally via I18nManager.forceRTL(true)
