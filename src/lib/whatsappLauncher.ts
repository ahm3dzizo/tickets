export type WhatsAppAppTarget = 'whatsapp' | 'business';

export interface WhatsAppOpenRequest {
  phone: string;
  message?: string;
}

export const WHATSAPP_PICKER_EVENT = 'tickets:whatsapp-picker';

export function normalizeWhatsAppPhone(phone: string): string {
  return String(phone || '').replace(/\D/g, '').replace(/^00/, '');
}

export function buildWhatsAppWebUrl(phone: string, message?: string): string {
  const cleanPhone = normalizeWhatsAppPhone(phone);
  const query = message ? `?text=${encodeURIComponent(message)}` : '';
  return `https://wa.me/${cleanPhone}${query}`;
}

export function launchWhatsAppApp(
  target: WhatsAppAppTarget,
  phone: string,
  message?: string,
): boolean {
  const cleanPhone = normalizeWhatsAppPhone(phone);
  if (!cleanPhone) return false;

  const fallbackUrl = buildWhatsAppWebUrl(cleanPhone, message);
  const isAndroid = /Android/i.test(navigator.userAgent);

  if (!isAndroid) {
    window.open(fallbackUrl, '_blank', 'noopener,noreferrer');
    return true;
  }

  const packageName = target === 'business' ? 'com.whatsapp.w4b' : 'com.whatsapp';
  const params = new URLSearchParams({ phone: cleanPhone });
  if (message) params.set('text', message);

  const intentUrl =
    `intent://send?${params.toString()}` +
    `#Intent;scheme=whatsapp;package=${packageName};` +
    `S.browser_fallback_url=${encodeURIComponent(fallbackUrl)};end`;

  window.location.href = intentUrl;
  return true;
}

export function requestWhatsAppOpen(phone: string, message?: string): boolean {
  const cleanPhone = normalizeWhatsAppPhone(phone);
  if (!cleanPhone) return false;

  window.dispatchEvent(new CustomEvent<WhatsAppOpenRequest>(WHATSAPP_PICKER_EVENT, {
    detail: { phone: cleanPhone, message },
  }));
  return true;
}

export function parseWhatsAppLink(href: string): WhatsAppOpenRequest | null {
  try {
    const url = new URL(href, window.location.href);
    if (url.hostname !== 'wa.me' && url.hostname !== 'www.wa.me') return null;

    const phone = normalizeWhatsAppPhone(url.pathname.replace(/^\//, ''));
    if (!phone) return null;

    return {
      phone,
      message: url.searchParams.get('text') || undefined,
    };
  } catch {
    return null;
  }
}
