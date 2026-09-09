import type { NextFunction, Request, Response } from 'express';

const MAX_OPERATION_GPS_ACCURACY_M = 150;

function requestPath(req: Request): string {
  return String(req.originalUrl || req.url || '').split('?')[0];
}

function validCoordinate(value: unknown, min: number, max: number): number | null {
  const number = Number(value);
  return Number.isFinite(number) && number >= min && number <= max ? number : null;
}

/**
 * Guard the technician actions where the recorded field location matters.
 *
 * Attendance has a stricter multi-sample 200m office geofence. Appointment
 * claim/finish happen at field units, whose coordinates are not yet stored for
 * every unit, so for now we enforce a real usable GPS fix rather than a unit
 * geofence. Once unit coordinates are populated this middleware is the natural
 * place to add the second geofence.
 */
export function requireTechOperationalLocation(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  if (req.method.toUpperCase() !== 'POST') {
    next();
    return;
  }

  const path = requestPath(req);
  const isClaim = /^\/api\/tech\/appointments\/[^/]+\/claim$/.test(path);
  const isFinish = /^\/api\/tech\/appointments\/[^/]+\/finish$/.test(path);

  if (!isClaim && !isFinish) {
    next();
    return;
  }

  const lat = validCoordinate(req.body?.lat, -90, 90);
  const lng = validCoordinate(req.body?.lng, -180, 180);
  if (lat === null || lng === null) {
    res.status(422).json({
      code: 'TECH_LOCATION_REQUIRED',
      error: 'يجب تشغيل GPS والحصول على موقع صالح قبل تنفيذ هذا الإجراء.',
    });
    return;
  }

  // Claim already sends accuracy from the browser and must have a reasonably
  // precise fix. Finish currently sends lat/lng on all supported clients; if a
  // newer client also sends accuracy, validate it with the same policy.
  const accuracyProvided = req.body?.accuracy !== undefined && req.body?.accuracy !== null;
  const accuracy = Number(req.body?.accuracy);
  if (isClaim && (!Number.isFinite(accuracy) || accuracy <= 0)) {
    res.status(422).json({
      code: 'TECH_LOCATION_ACCURACY_REQUIRED',
      error: 'تعذر التحقق من دقة موقعك. انتظر ثبات GPS ثم حاول مرة أخرى.',
    });
    return;
  }
  if (accuracyProvided && (!Number.isFinite(accuracy) || accuracy <= 0 || accuracy > MAX_OPERATION_GPS_ACCURACY_M)) {
    res.status(422).json({
      code: 'TECH_LOCATION_INACCURATE',
      error: `دقة الموقع غير كافية. يجب أن تكون أفضل من ${MAX_OPERATION_GPS_ACCURACY_M} متر.`,
      maxAccuracyM: MAX_OPERATION_GPS_ACCURACY_M,
    });
    return;
  }

  req.body.lat = lat;
  req.body.lng = lng;
  if (accuracyProvided || isClaim) req.body.accuracy = accuracy;
  next();
}
