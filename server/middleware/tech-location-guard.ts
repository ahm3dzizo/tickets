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
 * Guard technician actions where field location matters.
 *
 * Clock-in keeps its stricter multi-sample 200m project-office geofence.
 * Claim, arrival, work-start, finish and clock-out require a real, reasonably
 * accurate GPS fix. Unit coordinates are not yet populated consistently, so we
 * intentionally do not invent a villa geofence until that data exists.
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
  const requiresLocation =
    /^\/api\/tech\/appointments\/[^/]+\/(claim|arrive|start-work|finish)$/.test(path) ||
    path === '/api/shift/clock-out';

  if (!requiresLocation) {
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

  const accuracy = Number(req.body?.accuracy);
  if (!Number.isFinite(accuracy) || accuracy <= 0) {
    res.status(422).json({
      code: 'TECH_LOCATION_ACCURACY_REQUIRED',
      error: 'تعذر التحقق من دقة موقعك. انتظر ثبات GPS ثم حاول مرة أخرى.',
    });
    return;
  }
  if (accuracy > MAX_OPERATION_GPS_ACCURACY_M) {
    res.status(422).json({
      code: 'TECH_LOCATION_INACCURATE',
      error: `دقة الموقع غير كافية. يجب أن تكون أفضل من ${MAX_OPERATION_GPS_ACCURACY_M} متر.`,
      maxAccuracyM: MAX_OPERATION_GPS_ACCURACY_M,
      accuracyM: Math.round(accuracy),
    });
    return;
  }

  req.body.lat = lat;
  req.body.lng = lng;
  req.body.accuracy = accuracy;
  next();
}
