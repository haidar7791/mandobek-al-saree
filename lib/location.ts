import * as Location from "expo-location";

import type { GeoLocation } from "./db_logic";

export async function getApproximateLocationByIP(): Promise<GeoLocation | null> {
  try {
    const response = await fetch("https://ipapi.co/json/");

    if (!response.ok) return null;

    const data = await response.json();

    const latitude = Number(data?.latitude);
    const longitude = Number(data?.longitude);

    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      return null;
    }

    return {
      lat: latitude,
      lng: longitude,
    };
  } catch {
    return null;
  }
}

export async function getOptionalCurrentLocation(): Promise<GeoLocation | null> {
  try {
    const permission = await Location.getForegroundPermissionsAsync();

    if (permission.status !== "granted") {
      const requested = await Location.requestForegroundPermissionsAsync();

      if (requested.status !== "granted") {
        return null;
      }
    }

    const position = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });

    return {
      lat: position.coords.latitude,
      lng: position.coords.longitude,
    };
  } catch {
    return null;
  }
}
