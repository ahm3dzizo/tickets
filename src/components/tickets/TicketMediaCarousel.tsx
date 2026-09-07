import React, { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, ImageIcon, PlayCircle, Video } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { authStorage } from '@/lib/api';
import { cn } from '@/lib/utils';
import { isDisplayableTicketMedia, TicketMediaItem } from '@/lib/ticketMedia';
import { ticketDetailText } from '@/i18n/ticketDetail';

const t = ticketDetailText.ar;

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

function MediaSlide({ item }: { item: TicketMediaItem }) {
  const protectedAttachment = isProtectedTicketAttachment(item.url);
  const [failed, setFailed] = useState(false);
  const [sourceUrl, setSourceUrl] = useState<string | null>(protectedAttachment ? null : item.url);
  const isVideo = item.kind === 'video' || item.kind === 'youtube' || item.kind === 'vimeo';

  useEffect(() => {
    setFailed(false);

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
      .then(response => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.blob();
      })
      .then(blob => {
        if (controller.signal.aborted) return;
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
  }, [item.url, protectedAttachment]);

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

  if (item.kind === 'youtube' || item.kind === 'vimeo') {
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

  if (item.kind === 'video') {
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
          onError={() => setFailed(true)}
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
        onError={() => setFailed(true)}
      />
    </div>
  );
}

export function TicketMediaCarousel({ items, className }: TicketMediaCarouselProps) {
  const displayItems = useMemo(() => items.filter(isDisplayableTicketMedia), [items]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [touchStartX, setTouchStartX] = useState<number | null>(null);

  useEffect(() => {
    if (activeIndex >= displayItems.length) setActiveIndex(0);
  }, [activeIndex, displayItems.length]);

  useEffect(() => {
    setActiveIndex(0);
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
        <MediaSlide key={`${current.kind}:${current.url}`} item={current} />

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
          {current.kind === 'image' ? (
            <ImageIcon className="h-4 w-4 shrink-0 text-primary" />
          ) : (
            <Video className="h-4 w-4 shrink-0 text-primary" />
          )}
          <span>{current.kind === 'image' ? t.imageAttachment : t.videoAttachment}</span>
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
