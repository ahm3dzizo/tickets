import React, { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, ImageIcon, PlayCircle, Video } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { authStorage } from '@/lib/api';
import { cn } from '@/lib/utils';
import { isDisplayableTicketMedia, TicketMediaItem } from '@/lib/ticketMedia';
import { ticketDetailText } from '@/i18n/ticketDetail';

const t = ticketDetailText.ar;

type ResolvedMediaKind = 'image' | 'video';

interface TicketMediaCarouselProps {
  items: TicketMediaItem[];
  className?: string;
}

function isProtectedTicketAttachment(url: string): boolean {
  try {
    const parsed = new URL(url, window.location.origin);
    return parsed.origin === window.location.origin && parsed.pathname.startsWith('/api/ticket-attachments/');
  } catch {
    return false;
  }
}

function kindFromContentType(contentType?: string | null): ResolvedMediaKind | null {
  const normalized = String(contentType || '').toLowerCase();
  if (normalized.startsWith('video/')) return 'video';
  if (normalized.startsWith('image/')) return 'image';
  return null;
}

async function detectBlobKind(blob: Blob, responseContentType?: string | null): Promise<ResolvedMediaKind | null> {
  // Prefer the actual file signature over an extension/MIME hint. This also
  // handles legacy attachments that were saved with the wrong extension.
  try {
    const bytes = new Uint8Array(await blob.slice(0, 16).arrayBuffer());
    const ascii = String.fromCharCode(...bytes);

    if (bytes.length >= 12 && ascii.slice(4, 8) === 'ftyp') return 'video';
    if (bytes.length >= 4 && bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3) return 'video';
    if (bytes.length >= 4 && ascii.slice(0, 4) === 'OggS') return 'video';

    if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image';
    if (bytes.length >= 8 && bytes[0] === 0x89 && ascii.slice(1, 4) === 'PNG') return 'image';
    if (bytes.length >= 6 && (ascii.slice(0, 6) === 'GIF87a' || ascii.slice(0, 6) === 'GIF89a')) return 'image';
    if (bytes.length >= 12 && ascii.slice(0, 4) === 'RIFF' && ascii.slice(8, 12) === 'WEBP') return 'image';
  } catch {
    // Fall through to MIME detection.
  }

  return kindFromContentType(blob.type) || kindFromContentType(responseContentType);
}

function MediaSlide({
  item,
  onKindResolved,
}: {
  item: TicketMediaItem;
  onKindResolved?: (kind: ResolvedMediaKind) => void;
}) {
  const protectedAttachment = isProtectedTicketAttachment(item.url);
  const initialKind: ResolvedMediaKind = item.kind === 'video' ? 'video' : 'image';
  const [failed, setFailed] = useState(false);
  const [fallbackAttempted, setFallbackAttempted] = useState(false);
  const [resolvedKind, setResolvedKind] = useState<ResolvedMediaKind>(initialKind);
  const [sourceUrl, setSourceUrl] = useState<string | null>(protectedAttachment ? null : item.url);
  const isEmbeddedVideo = item.kind === 'youtube' || item.kind === 'vimeo';
  const isVideo = isEmbeddedVideo || resolvedKind === 'video';

  useEffect(() => {
    setFailed(false);
    setFallbackAttempted(false);
    setResolvedKind(initialKind);

    if (!protectedAttachment) {
      setSourceUrl(item.url);
      return;
    }

    const token = authStorage.getToken();
    if (!token) {
      setSourceUrl(null);
      setFailed(true);
      return;
    }

    const controller = new AbortController();
    let objectUrl: string | null = null;
    setSourceUrl(null);

    fetch(item.url, {
      headers: { Authorization: `Bearer ${token}` },
      signal: controller.signal,
    })
      .then(async response => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const responseContentType = response.headers.get('content-type');
        const blob = await response.blob();
        return { blob, responseContentType };
      })
      .then(async ({ blob, responseContentType }) => {
        if (controller.signal.aborted) return;

        const detectedKind = await detectBlobKind(blob, responseContentType);
        if (controller.signal.aborted) return;
        if (detectedKind) {
          setResolvedKind(detectedKind);
          onKindResolved?.(detectedKind);
        }

        objectUrl = URL.createObjectURL(blob);
        setSourceUrl(objectUrl);
      })
      .catch(error => {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        setFailed(true);
      });

    return () => {
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [item.url, protectedAttachment, initialKind, onKindResolved]);

  if (failed) {
    return (
      <div className="flex aspect-[4/3] w-full flex-col items-center justify-center gap-3 bg-muted/30 px-6 text-center sm:aspect-video">
        {isVideo ? <Video className="h-10 w-10 text-muted-foreground" /> : <ImageIcon className="h-10 w-10 text-muted-foreground" />}
        <p className="text-sm font-semibold text-muted-foreground">
          {isVideo ? t.videoLoadFailed : t.imageLoadFailed}
        </p>
      </div>
    );
  }

  if (isEmbeddedVideo) {
    return (
      <div className="relative aspect-[4/3] w-full overflow-hidden bg-black sm:aspect-video">
        <iframe
          src={item.embedUrl}
          title={t.videoAttachment}
          className="absolute inset-0 h-full w-full border-0"
          loading="lazy"
          referrerPolicy="strict-origin-when-cross-origin"
          allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
          allowFullScreen
          onError={() => setFailed(true)}
        />
      </div>
    );
  }

  if (!sourceUrl) {
    return (
      <div className="flex aspect-[4/3] w-full items-center justify-center bg-muted/20 sm:aspect-video">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary/20 border-t-primary" />
      </div>
    );
  }

  if (resolvedKind === 'video') {
    return (
      <div className="flex aspect-[4/3] w-full items-center justify-center bg-black sm:aspect-video">
        <video
          key={sourceUrl}
          src={sourceUrl}
          controls
          controlsList="nodownload"
          playsInline
          preload="metadata"
          className="h-full w-full object-contain"
          onError={() => {
            if (fallbackAttempted && item.kind === 'image') {
              setResolvedKind('image');
              onKindResolved?.('image');
            }
            setFailed(true);
          }}
        >
          {t.videoLoadFailed}
        </video>
      </div>
    );
  }

  return (
    <div className="flex aspect-[4/3] w-full items-center justify-center bg-black/5 sm:aspect-video">
      <img
        src={sourceUrl}
        alt={t.imageAttachment}
        loading="lazy"
        decoding="async"
        referrerPolicy="no-referrer"
        className="h-full w-full object-contain"
        onError={() => {
          // Some legacy/external media URLs look like images even though they
          // actually return a video. If image rendering fails, try the same URL
          // once as a video before showing the final failure state.
          if (!fallbackAttempted) {
            setFallbackAttempted(true);
            setResolvedKind('video');
            onKindResolved?.('video');
            return;
          }
          setFailed(true);
        }}
      />
    </div>
  );
}

export function TicketMediaCarousel({ items, className }: TicketMediaCarouselProps) {
  const displayItems = useMemo(() => items.filter(isDisplayableTicketMedia), [items]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [touchStartX, setTouchStartX] = useState<number | null>(null);
  const [resolvedKinds, setResolvedKinds] = useState<Record<string, ResolvedMediaKind>>({});

  useEffect(() => {
    if (activeIndex >= displayItems.length) setActiveIndex(0);
  }, [activeIndex, displayItems.length]);

  useEffect(() => {
    setActiveIndex(0);
    setResolvedKinds({});
  }, [items]);

  const hasMany = displayItems.length > 1;

  const previous = () => {
    if (!displayItems.length) return;
    setActiveIndex(index => (index - 1 + displayItems.length) % displayItems.length);
  };

  const next = () => {
    if (!displayItems.length) return;
    setActiveIndex(index => (index + 1) % displayItems.length);
  };

  const handleTouchStart = (event: React.TouchEvent<HTMLDivElement>) => {
    setTouchStartX(event.touches[0]?.clientX ?? null);
  };

  const handleTouchEnd = (event: React.TouchEvent<HTMLDivElement>) => {
    if (touchStartX === null) return;
    const endX = event.changedTouches[0]?.clientX;
    setTouchStartX(null);
    if (endX === undefined) return;

    const delta = endX - touchStartX;
    if (Math.abs(delta) < 45) return;
    if (delta > 0) previous();
    else next();
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'ArrowRight') previous();
    if (event.key === 'ArrowLeft') next();
  };

  if (!displayItems.length) {
    return (
      <div className={cn('rounded-2xl border border-dashed border-border bg-muted/20 px-5 py-8 text-center', className)}>
        <PlayCircle className="mx-auto mb-3 h-9 w-9 text-muted-foreground" />
        <p className="text-sm font-semibold text-muted-foreground">{t.noMedia}</p>
      </div>
    );
  }

  const current = displayItems[activeIndex];
  const currentKind = resolvedKinds[current.url] ?? current.kind;
  const currentIsImage = currentKind === 'image';

  return (
    <div
      className={cn('min-w-0 max-w-full overflow-hidden rounded-2xl border border-border/70 bg-background shadow-sm', className)}
      dir="rtl"
      role="region"
      aria-label={t.mediaTitle}
      tabIndex={0}
      onKeyDown={handleKeyDown}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      <div className="relative min-w-0 max-w-full overflow-hidden">
        <MediaSlide
          key={`${current.kind}:${current.url}`}
          item={current}
          onKindResolved={kind => {
            setResolvedKinds(previousKinds => previousKinds[current.url] === kind
              ? previousKinds
              : { ...previousKinds, [current.url]: kind });
          }}
        />

        {hasMany && (
          <>
            <Button
              type="button"
              variant="secondary"
              size="icon"
              className="absolute right-2 top-1/2 z-10 h-9 w-9 -translate-y-1/2 rounded-full bg-background/90 shadow-md backdrop-blur hover:bg-background sm:right-3 sm:h-10 sm:w-10"
              onClick={previous}
              aria-label={t.previousMedia}
              title={t.previousMedia}
            >
              <ChevronRight className="h-5 w-5" />
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="icon"
              className="absolute left-2 top-1/2 z-10 h-9 w-9 -translate-y-1/2 rounded-full bg-background/90 shadow-md backdrop-blur hover:bg-background sm:left-3 sm:h-10 sm:w-10"
              onClick={next}
              aria-label={t.nextMedia}
              title={t.nextMedia}
            >
              <ChevronLeft className="h-5 w-5" />
            </Button>
          </>
        )}
      </div>

      <div className="flex min-w-0 items-center justify-between gap-3 border-t border-border/60 px-3 py-2.5 sm:px-4">
        <div className="flex min-w-0 items-center gap-2 text-xs font-bold text-foreground">
          {currentIsImage ? (
            <ImageIcon className="h-4 w-4 shrink-0 text-primary" />
          ) : (
            <Video className="h-4 w-4 shrink-0 text-primary" />
          )}
          <span>{currentIsImage ? t.imageAttachment : t.videoAttachment}</span>
        </div>

        {hasMany && (
          <span className="shrink-0 text-xs tabular-nums text-muted-foreground" dir="ltr">
            {activeIndex + 1} {t.mediaCounterSeparator} {displayItems.length}
          </span>
        )}
      </div>

      {hasMany && (
        <div className="flex items-center justify-center gap-1.5 px-3 pb-3" aria-hidden="true">
          {displayItems.map((item, index) => (
            <button
              key={`${item.kind}:${item.url}`}
              type="button"
              className={cn(
                'h-1.5 rounded-full transition-all',
                index === activeIndex ? 'w-6 bg-primary' : 'w-1.5 bg-muted-foreground/30',
              )}
              onClick={() => setActiveIndex(index)}
              tabIndex={-1}
            />
          ))}
        </div>
      )}
    </div>
  );
}
