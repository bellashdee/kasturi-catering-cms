const EARTH_RADIUS_KM = 6371;

export type LatLng = { latitude: number; longitude: number };

export function haversineKm(a: LatLng, b: LatLng): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLng = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);

  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h));
}

export const GEOFENCE_RADIUS_KM = 5;

export function getCurrentPosition(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("This device/browser does not support location access."));
      return;
    }
    navigator.geolocation.getCurrentPosition(resolve, (err) => reject(new Error(geolocationErrorMessage(err))), {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 0,
    });
  });
}

function geolocationErrorMessage(err: GeolocationPositionError): string {
  switch (err.code) {
    case err.PERMISSION_DENIED:
      return "Location permission was denied. Allow location access to clock in/out.";
    case err.POSITION_UNAVAILABLE:
      return "Could not determine your location. Try again outdoors or with a better signal.";
    case err.TIMEOUT:
      return "Getting your location timed out. Try again.";
    default:
      return "Could not get your location.";
  }
}
