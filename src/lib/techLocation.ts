import { TechLang, t } from '@/i18n/tech';

export type TechLocationSample = {
  lat: number;
  lng: number;
  accuracy: number;
  sampledAt: number;
  sampleCount: number;
  sampleSpreadM: number;
  speed?: number | null;
  altitudeAccuracy?: number | null;
};

function distanceMeters(a: GeolocationCoordinates, b: GeolocationCoordinates) {
  const radius = 6371000;
  const toRad = (value: number) => value * Math.PI / 180;
  const latDelta = toRad(b.latitude - a.latitude);
  const lngDelta = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);
  const h = Math.sin(latDelta / 2) ** 2
    + Math.cos(lat1) * Math.cos(lat2) * Math.sin(lngDelta / 2) ** 2;
  return radius * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

/**
 * Collect three fresh high-accuracy fixes and use the most accurate one.
 * The sample metadata is also sent for attendance anti-spoofing checks and gives
 * field actions a consistent GPS policy instead of each screen taking a single,
 * potentially stale browser position.
 */
export async function collectTechLocation(lang: TechLang): Promise<TechLocationSample> {
  if (!navigator.geolocation) {
    throw new Error(t(lang, 'locationUnsupported'));
  }

  const samples: GeolocationPosition[] = [];
  for (let index = 0; index < 3; index += 1) {
    const position = await new Promise<GeolocationPosition>((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(resolve, reject, {
        timeout: 10000,
        maximumAge: 0,
        enableHighAccuracy: true,
      });
    });
    samples.push(position);
    if (index < 2) await new Promise(resolve => window.setTimeout(resolve, 450));
  }

  const best = [...samples].sort((a, b) => a.coords.accuracy - b.coords.accuracy)[0];
  const spreads = samples.flatMap((sample, index) =>
    samples.slice(index + 1).map(other => distanceMeters(sample.coords, other.coords))
  );

  return {
    lat: best.coords.latitude,
    lng: best.coords.longitude,
    accuracy: best.coords.accuracy,
    sampledAt: best.timestamp,
    sampleCount: samples.length,
    sampleSpreadM: spreads.length ? Math.max(...spreads) : 0,
    speed: Number.isFinite(best.coords.speed) ? best.coords.speed : null,
    altitudeAccuracy: Number.isFinite(best.coords.altitudeAccuracy) ? best.coords.altitudeAccuracy : null,
  };
}
