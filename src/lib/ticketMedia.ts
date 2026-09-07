export type TicketMediaKind = 'youtube' | 'vimeo' | 'video' | 'image' | 'link';

export interface TicketMediaItem {
  url: string;
  kind: TicketMediaKind;
  embedUrl?: string;
}

const URL_RE = /https?:\/\/[^\s<>"']+/gi;
const DIRECT_VIDEO_RE = /\.(mp4|webm|ogg|ogv|m4v|mov)(?:$|[?#])/i;
const IMAGE_RE = /\.(png|jpe?g|webp|gif|avif|bmp)(?:$|[?#])/i;
const VIDEO_MIME_HINT_RE = /(?:video%2F|video\/)(?:mp4|webm|ogg|quicktime|x-m4v)/i;
const IMAGE_MIME_HINT_RE = /(?:image%2F|image\/)(?:png|jpe?g|webp|gif|avif|bmp)/i;

function trimTrailingPunctuation(value: string): string {
  return value.replace(/[),.،؛;\]}]+$/g, '');
}

function normalizeHttpUrl(value: string): URL | null {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:' ? parsed : null;
  } catch {
    return null;
  }
}

function youtubeId(parsed: URL): string | null {
  const host = parsed.hostname.toLowerCase().replace(/^www\./, '');

  let id: string | null = null;
  if (host === 'youtu.be') {
    id = parsed.pathname.split('/').filter(Boolean)[0] ?? null;
  } else if (host === 'youtube.com' || host === 'm.youtube.com') {
    id = parsed.searchParams.get('v');
    if (!id) {
      const parts = parsed.pathname.split('/').filter(Boolean);
      if (parts[0] === 'shorts' || parts[0] === 'embed') id = parts[1] ?? null;
    }
  }

  return id && /^[A-Za-z0-9_-]{6,20}$/.test(id) ? id : null;
}

function vimeoId(parsed: URL): string | null {
  const host = parsed.hostname.toLowerCase().replace(/^www\./, '');
  if (host !== 'vimeo.com' && host !== 'player.vimeo.com') return null;
  const id = parsed.pathname.split('/').filter(Boolean).find(part => /^\d+$/.test(part));
  return id ?? null;
}

function mediaHint(parsed: URL): string {
  const raw = `${parsed.pathname}${parsed.search}`;
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

export function classifyTicketMedia(url: string): TicketMediaItem | null {
  const parsed = normalizeHttpUrl(url);
  if (!parsed) return null;

  const ytId = youtubeId(parsed);
  if (ytId) {
    return {
      url: parsed.toString(),
      kind: 'youtube',
      embedUrl: `https://www.youtube-nocookie.com/embed/${ytId}?playsinline=1&rel=0`,
    };
  }

  const vmId = vimeoId(parsed);
  if (vmId) {
    return {
      url: parsed.toString(),
      kind: 'vimeo',
      embedUrl: `https://player.vimeo.com/video/${vmId}?playsinline=1`,
    };
  }

  const hint = mediaHint(parsed);

  if (DIRECT_VIDEO_RE.test(hint) || VIDEO_MIME_HINT_RE.test(hint)) {
    return { url: parsed.toString(), kind: 'video' };
  }

  if (IMAGE_RE.test(hint) || IMAGE_MIME_HINT_RE.test(hint)) {
    return { url: parsed.toString(), kind: 'image' };
  }

  return { url: parsed.toString(), kind: 'link' };
}

export function isDisplayableTicketMedia(item: TicketMediaItem): boolean {
  return item.kind === 'image' || item.kind === 'video' || item.kind === 'youtube' || item.kind === 'vimeo';
}

export function extractTicketMedia(text?: string | null): {
  cleanText: string;
  items: TicketMediaItem[];
} {
  if (!text) return { cleanText: '', items: [] };

  const rawUrls = text.match(URL_RE) ?? [];
  const seen = new Set<string>();
  const items: TicketMediaItem[] = [];

  for (const raw of rawUrls) {
    const cleaned = trimTrailingPunctuation(raw);
    const item = classifyTicketMedia(cleaned);
    if (!item || seen.has(item.url)) continue;
    seen.add(item.url);
    items.push(item);
  }

  const cleanText = text
    .replace(URL_RE, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return { cleanText, items };
}
