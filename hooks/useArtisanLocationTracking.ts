import { useEffect, useRef } from "react";
import * as Location from "expo-location";
import {
  getArtisanByUserId,
  subscribeToServiceRequests,
  updateArtisanLocation,
  updateRequestLiveLocation,
  type GeoLocation,
} from "@/lib/db_logic";

// ─── Automatic Artisan Location Tracking ───────────────────────────────────
//
// No manual online/offline toggle: as soon as a logged-in artisan has the app
// open in the foreground, their position is kept fresh in Firestore.
//
// Two modes:
//  - "light"   (default): a fix is written every 15 minutes, or immediately
//              if the artisan has moved more than 1km — whichever comes
//              first. Cheap on battery/data for the common "just browsing"
//              case.
//  - "intense" (only while one of this artisan's requests is "on_the_way" or
//              "in_progress"): a fix is written roughly every minute so the
//              client's live map stays accurate. Drops back to "light" the
//              moment the order is completed/cancelled/no longer active.
//
// Applies to whichever request the artisan currently has active — the
// artisan doc's `location` field is always kept in sync, and the specific
// service request's `artisanLiveLocation` is also updated while intense
// tracking is running for it.

const LIGHT_TIME_INTERVAL_MS = 15 * 60 * 1000; // 15 minutes
const LIGHT_DISTANCE_INTERVAL_M = 1000; // 1 km
const INTENSE_TIME_INTERVAL_MS = 60 * 1000; // 1 minute
const INTENSE_DISTANCE_INTERVAL_M = 0;

type TrackingMode = "light" | "intense";

export function useArtisanLocationTracking(userId: string | null | undefined) {
  const artisanIdRef = useRef<string | null>(null);
  const watchRef = useRef<Location.LocationSubscription | null>(null);
  const modeRef = useRef<TrackingMode | null>(null);
  const activeRequestIdRef = useRef<string | null>(null);

  const persistLocation = async (loc: GeoLocation) => {
    const artisanId = artisanIdRef.current;
    if (!artisanId) return;
    updateArtisanLocation(artisanId, loc).catch(() => {});
    if (modeRef.current === "intense" && activeRequestIdRef.current) {
      updateRequestLiveLocation(activeRequestIdRef.current, loc).catch(() => {});
    }
  };

  const startTracking = async (mode: TrackingMode) => {
    if (!artisanIdRef.current) return;
    if (modeRef.current === mode && watchRef.current) return;

    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") return;

      // Immediate fix so the artisan doc / active request reflect reality
      // right away, without waiting for the first watch callback.
      try {
        const pos = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        await persistLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      } catch {}

      watchRef.current?.remove();
      modeRef.current = mode;

      const options =
        mode === "intense"
          ? {
              accuracy: Location.Accuracy.High,
              timeInterval: INTENSE_TIME_INTERVAL_MS,
              distanceInterval: INTENSE_DISTANCE_INTERVAL_M,
            }
          : {
              accuracy: Location.Accuracy.Balanced,
              timeInterval: LIGHT_TIME_INTERVAL_MS,
              distanceInterval: LIGHT_DISTANCE_INTERVAL_M,
            };

      watchRef.current = await Location.watchPositionAsync(options, (pos) => {
        persistLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      });
    } catch (err) {
      console.error("useArtisanLocationTracking startTracking error:", err);
    }
  };

  const stopTracking = () => {
    watchRef.current?.remove();
    watchRef.current = null;
    modeRef.current = null;
    artisanIdRef.current = null;
    activeRequestIdRef.current = null;
  };

  // Resolve the artisan profile for this user (if any) and kick off light
  // tracking immediately when the app opens.
  useEffect(() => {
    let cancelled = false;
    if (!userId) {
      stopTracking();
      return;
    }
    (async () => {
      const artisan = await getArtisanByUserId(userId);
      if (cancelled) return;
      artisanIdRef.current = artisan?.id ?? null;
      if (artisanIdRef.current) {
        await startTracking("light");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  // Watch this artisan's requests to flip into intense tracking exactly
  // while one is "on_the_way" / "in_progress", and back to light otherwise.
  useEffect(() => {
    if (!userId) return;
    const unsub = subscribeToServiceRequests(
      userId,
      (requests) => {
        if (!artisanIdRef.current) return; // not an artisan account
        const active = requests.find(
          (r) => r.status === "on_the_way" || r.status === "in_progress"
        );
        if (active) {
          activeRequestIdRef.current = active.id;
          if (modeRef.current !== "intense") startTracking("intense");
        } else {
          activeRequestIdRef.current = null;
          if (modeRef.current === "intense") startTracking("light");
        }
      },
      () => {}
    );
    return unsub;
  }, [userId]);

  useEffect(() => {
    return () => stopTracking();
  }, []);
}
