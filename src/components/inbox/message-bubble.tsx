"use client";

import { useState, useEffect, useCallback, memo } from "react";
import { cn } from "@/lib/utils";
import type { Message, MessageReaction } from "@/types";
import {
  Clock,
  Check,
  CheckCheck,
  XCircle,
  FileText,
  MapPin,
  LayoutTemplate,
  ImageOff,
  CornerDownLeft,
  Download,
  ShoppingBag,
  Calendar,
  ExternalLink,
  ArrowUpRight,
} from "lucide-react";
import { format } from "date-fns";
import { ReplyQuote } from "./reply-quote";
import { MessageReactions } from "./message-reactions";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";


interface MessageBubbleProps {
  message: Message;
  /** Pre-computed quote info for messages that reply to another. */
  reply?: { authorLabel: string; preview: string } | null;
  reactions?: MessageReaction[];
  currentUserId?: string;
  onToggleReaction?: (emoji: string) => void;
}

function StatusIcon({ status }: { status: Message["status"] }) {
  switch (status) {
    case "sending":
      return <Clock className="h-3 w-3 text-muted-foreground" />;
    case "sent":
      return <Check className="h-3 w-3 text-muted-foreground" />;
    case "delivered":
      return <CheckCheck className="h-3 w-3 text-muted-foreground" />;
    case "read":
      return <CheckCheck className="h-3 w-3 text-blue-400" />;
    case "failed":
      return <XCircle className="h-3 w-3 text-red-400" />;
    default:
      return null;
  }
}

function MediaUnavailable({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 rounded-lg bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
      <ImageOff className="h-4 w-4 shrink-0 text-muted-foreground" />
      <span>{label} unavailable</span>
    </div>
  );
}

function MediaImage({ url, alt, className }: { url: string; alt: string; className?: string }) {
  const [src, setSrc] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [isOpen, setIsOpen] = useState(false);

  const loadImage = useCallback(async () => {
    if (!url) return;

    // ponytail: convert all image URLs to local blob URLs to support same-origin download and click-enlarge features
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error("Failed to load media");
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      setSrc(blobUrl);
    } catch {
      // Fallback to direct URL if fetch fails
      setSrc(url);
    } finally {
      setLoading(false);
    }
  }, [url]);

  useEffect(() => {
    loadImage();
    return () => {
      if (src?.startsWith("blob:")) {
        URL.revokeObjectURL(src);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadImage]);

  if (error) {
    return (
      <div className="flex h-40 w-60 items-center justify-center rounded-lg bg-muted">
        <ImageOff className="h-8 w-8 text-muted-foreground" />
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex h-40 w-60 items-center justify-center rounded-lg bg-muted">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <>
      <div
        onClick={() => setIsOpen(true)}
        className="cursor-pointer block hover:opacity-90 transition-opacity"
        title="Clique para abrir"
      >
        <img
          src={src ?? ""}
          alt={alt}
          className={className || "max-h-64 max-w-60 rounded-lg object-cover"}
          onError={() => setError(true)}
        />
      </div>

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="max-w-[95vw] sm:max-w-4xl md:max-w-5xl w-full max-h-[95vh] bg-background/95 backdrop-blur-md border border-border p-4 flex flex-col items-center justify-between gap-4">
          <DialogHeader className="w-full flex flex-row items-center justify-between border-b pb-2">
            <DialogTitle className="text-foreground font-semibold">Visualizar Imagem</DialogTitle>
          </DialogHeader>

          <div className="flex-1 flex items-center justify-center overflow-hidden w-full max-h-[80vh]">
            <img
              src={src ?? ""}
              alt={alt}
              className="max-w-full max-h-[78vh] object-contain rounded-lg shadow-lg"
            />
          </div>

          <div className="w-full flex justify-end gap-2 pt-2 border-t">
            <a
              href={src ?? ""}
              download="whatsapp-image"
              className="inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 bg-primary text-primary-foreground shadow hover:bg-primary/90 h-9 px-4 py-2 gap-1.5"
            >
              <Download className="h-4 w-4" />
              Baixar
            </a>
            <Button
              variant="outline"
              onClick={() => setIsOpen(false)}
              className="h-9 px-4 py-2"
            >
              Fechar
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

import { LinkPreview } from "./link-preview";

// ponytail: helper to parse text and turn URLs into clickable anchor tags while preventing text overflow
function renderTextWithLinks(text: string, isAgent: boolean) {
  if (!text) return null;

  const urlRegex = /(https?:\/\/[^\s]+|www\.[^\s]+)/g;
  const parts = text.split(urlRegex);

  return parts.map((part, index) => {
    if (urlRegex.test(part)) {
      // Re-test because split retains matched strings
      const href = part.startsWith("www.") ? `https://${part}` : part;
      return (
        <a
          key={index}
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className={cn(
            "underline font-medium break-all [overflow-wrap:anywhere]",
            isAgent
              ? "text-blue-200 hover:text-white"
              : "text-primary hover:underline"
          )}
        >
          {part}
        </a>
      );
    }
    return part;
  });
}

function extractFirstUrl(text: string | null | undefined): string | null {
  if (!text) return null;
  const match = text.match(/(https?:\/\/[^\s]+|www\.[^\s]+)/);
  if (!match) return null;
  const rawUrl = match[0];
  return rawUrl.startsWith("www.") ? `https://${rawUrl}` : rawUrl;
}

interface ActionLink {
  url: string;
  type: 'product' | 'booking' | 'general';
  title: string;
  subtitle?: string;
}

function extractActionLinks(text: string | null | undefined): ActionLink[] {
  if (!text) return [];
  const urlRegex = /(https?:\/\/[^\s]+|www\.[^\s]+)/g;
  const matches = text.match(urlRegex) || [];
  const links: ActionLink[] = [];
  const seen = new Set<string>();

  for (const rawUrl of matches) {
    const cleanUrl = rawUrl.replace(/[.,;)]+$/, '');
    const href = cleanUrl.startsWith("www.") ? `https://${cleanUrl}` : cleanUrl;
    if (seen.has(href)) continue;
    seen.add(href);

    try {
      const parsed = new URL(href);
      const pathname = parsed.pathname;

      if (pathname.includes('/product/') || pathname.includes('/shop/')) {
        const parts = pathname.split('/').filter(Boolean);
        const lastPart = parts[parts.length - 1];
        let productName = lastPart
          ? lastPart.replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
          : 'Produto';
        
        productName = productName.replace(/\.(html|php|aspx?)$/i, '');

        links.push({
          url: href,
          type: 'product',
          title: 'Ver Produto',
          subtitle: productName,
        });
      } else if (
        pathname.includes('/book/') ||
        pathname.includes('/agendamento') ||
        pathname.includes('/appointments')
      ) {
        const parts = pathname.split('/').filter(Boolean);
        const lastPart = parts[parts.length - 1];
        const personName = lastPart && lastPart !== 'book'
          ? lastPart.replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
          : '';

        links.push({
          url: href,
          type: 'booking',
          title: 'Agendar Horário',
          subtitle: personName ? `com ${personName}` : 'Clique para agendar',
        });
      } else {
        links.push({
          url: href,
          type: 'general',
          title: 'Acessar Link',
          subtitle: parsed.hostname.replace(/^www\./, ''),
        });
      }
    } catch (_e) {
      // Invalid URL
    }
  }

  return links;
}

function ActionLinkButtons({ links, isAgent }: { links: ActionLink[]; isAgent: boolean }) {
  if (!links || links.length === 0) return null;

  return (
    <div className="mt-2.5 flex flex-col gap-1.5 pt-1">
      {links.map((link, idx) => {
        const isProduct = link.type === 'product';
        const isBooking = link.type === 'booking';

        return (
          <a
            key={idx}
            href={link.url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className={cn(
              "group/btn flex items-center justify-between gap-3 rounded-xl px-3.5 py-2.5 text-xs font-semibold shadow-xs transition-all duration-200 hover:shadow-md active:scale-98 cursor-pointer select-none",
              isAgent
                ? "bg-white/95 text-purple-950 hover:bg-white border border-white/40 shadow-sm"
                : "bg-primary text-primary-foreground hover:bg-primary/95 shadow-sm"
            )}
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <div
                className={cn(
                  "flex h-7 w-7 items-center justify-center rounded-lg shrink-0",
                  isAgent
                    ? (isBooking ? "bg-emerald-100 text-emerald-700" : "bg-purple-100 text-purple-700")
                    : (isBooking ? "bg-emerald-500/20 text-emerald-300" : "bg-primary-foreground/15 text-primary-foreground")
                )}
              >
                {isProduct && <ShoppingBag className="size-4 shrink-0" />}
                {isBooking && <Calendar className="size-4 shrink-0" />}
                {!isProduct && !isBooking && <ExternalLink className="size-4 shrink-0" />}
              </div>
              <div className="flex flex-col min-w-0 text-left">
                <span className="font-bold leading-tight truncate">
                  {link.title}
                </span>
                {link.subtitle && (
                  <span
                    className={cn(
                      "text-[11px] font-normal truncate opacity-85",
                      isAgent ? "text-purple-900/80" : "text-primary-foreground/80"
                    )}
                  >
                    {link.subtitle}
                  </span>
                )}
              </div>
            </div>

            <div className="flex items-center gap-1 shrink-0">
              <span className="text-[10px] uppercase font-bold tracking-wider opacity-70 group-hover/btn:opacity-100">
                Abrir
              </span>
              <ArrowUpRight className="size-3.5 shrink-0 opacity-70 group-hover/btn:opacity-100 group-hover/btn:translate-x-0.5 group-hover/btn:-translate-y-0.5 transition-all" />
            </div>
          </a>
        );
      })}
    </div>
  );
}

function MessageContent({ message, isAgent }: { message: Message; isAgent: boolean }) {
  const actionLinks = extractActionLinks(message.content_text);
  const firstUrl = extractFirstUrl(message.content_text);

  switch (message.content_type) {
    case "text":
      return (
        <div className="min-w-0 max-w-full">
          <p className="whitespace-pre-wrap break-all [overflow-wrap:anywhere] text-sm leading-relaxed">
            {renderTextWithLinks(message.content_text || "", isAgent)}
          </p>
          {actionLinks.length > 0 ? (
            <ActionLinkButtons links={actionLinks} isAgent={isAgent} />
          ) : (
            firstUrl && <LinkPreview url={firstUrl} isAgent={isAgent} />
          )}
        </div>
      );

    case "image":
      return (
        <div className="min-w-0 max-w-full">
          {message.media_url ? (
            <MediaImage url={message.media_url} alt="Shared image" />
          ) : (
            <MediaUnavailable label="Image" />
          )}
          {message.content_text && (
            <p className="mt-1 whitespace-pre-wrap break-all [overflow-wrap:anywhere] text-sm">
              {renderTextWithLinks(message.content_text, isAgent)}
            </p>
          )}
          {actionLinks.length > 0 ? (
            <ActionLinkButtons links={actionLinks} isAgent={isAgent} />
          ) : (
            firstUrl && <LinkPreview url={firstUrl} isAgent={isAgent} />
          )}
        </div>
      );

    case "sticker":
      return (
        <div className="flex justify-center p-0.5 bg-transparent">
          {message.media_url ? (
            <MediaImage
              url={message.media_url}
              alt="Shared sticker"
              className="max-h-32 max-w-32 object-contain select-none"
            />
          ) : (
            <MediaUnavailable label="Sticker" />
          )}
        </div>
      );

    case "video":
      return (
        <div className="min-w-0 max-w-full">
          {message.media_url ? (
            <video
              src={message.media_url}
              controls
              preload="metadata"
              className="max-h-64 max-w-60 rounded-lg bg-black object-contain"
            />
          ) : (
            <MediaUnavailable label="Video" />
          )}
          {message.content_text && message.content_text !== "[Vídeo]" && (
            <p className="mt-1 whitespace-pre-wrap break-all [overflow-wrap:anywhere] text-sm">
              {renderTextWithLinks(message.content_text, isAgent)}
            </p>
          )}
        </div>
      );

    case "audio":
      return (
        <div className="space-y-1.5 min-w-0 max-w-full">
          {message.media_url ? (
            <audio src={message.media_url} controls className="max-w-60" />
          ) : (
            <MediaUnavailable label="Audio" />
          )}
          {message.content_text && message.content_text !== "[Mensagem de voz]" && (
            <p className="mt-1.5 whitespace-pre-wrap break-all [overflow-wrap:anywhere] text-sm opacity-90">
              {renderTextWithLinks(message.content_text, isAgent)}
            </p>
          )}
        </div>
      );

    case "document":
      if (!message.media_url) {
        return <MediaUnavailable label={message.content_text || "Document"} />;
      }
      return (
        <a
          href={message.media_url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 rounded-lg bg-muted/50 px-3 py-2 text-sm hover:bg-muted"
        >
          <FileText className="h-5 w-5 shrink-0 text-muted-foreground" />
          <span className="truncate">
            {message.content_text || "Document"}
          </span>
        </a>
      );

    case "template":
      return (
        <div className="min-w-0 max-w-full">
          <span className="mb-1 inline-flex items-center gap-1 rounded bg-primary/20 px-1.5 py-0.5 text-[10px] font-medium text-primary">
            <LayoutTemplate className="h-3 w-3" />
            Template
          </span>
          {message.content_text && (
            <p className="mt-1 whitespace-pre-wrap break-all [overflow-wrap:anywhere] text-sm">
              {renderTextWithLinks(message.content_text, isAgent)}
            </p>
          )}
          {firstUrl && <LinkPreview url={firstUrl} isAgent={isAgent} />}
        </div>
      );

    case "location":
      return (
        <div className="flex items-center gap-2 text-sm">
          <MapPin className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span>{message.content_text || "Location shared"}</span>
        </div>
      );

    case "interactive": {
      return (
        <div className="flex flex-col gap-0.5 min-w-0 max-w-full">
          <span className="inline-flex items-center gap-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            <CornerDownLeft className="h-3 w-3" />
            Button reply
          </span>
          <p className="whitespace-pre-wrap break-all [overflow-wrap:anywhere] text-sm">
            {renderTextWithLinks(message.content_text || "[Interactive reply]", isAgent)}
          </p>
        </div>
      );
    }

    default:
      return (
        <p className="whitespace-pre-wrap break-all [overflow-wrap:anywhere] text-sm">
          {renderTextWithLinks(message.content_text || "[Unsupported message type]", isAgent)}
        </p>
      );
  }
}

export const MessageBubble = memo(function MessageBubble({
  message,
  reply,
  reactions,
  currentUserId,
  onToggleReaction,
}: MessageBubbleProps) {
  const isAgent = message.sender_type === "agent" || message.sender_type === "bot";
  const time = format(new Date(message.created_at), "HH:mm");

  return (
    <div
      className={cn(
        "flex flex-col min-w-0 max-w-full",
        isAgent ? "items-end" : "items-start",
      )}
    >
      <div
        className={cn(
          "relative rounded-2xl px-3 py-2 min-w-0 max-w-full overflow-hidden",
          message.content_type === "sticker"
            ? "bg-transparent text-foreground shadow-none"
            : isAgent
              ? "rounded-br-md bg-primary text-primary-foreground"
              : "rounded-bl-md bg-muted text-foreground",
        )}
      >
        {reply && (
          <ReplyQuote
            authorLabel={reply.authorLabel}
            preview={reply.preview}
            onPrimary={isAgent}
          />
        )}
        <MessageContent message={message} isAgent={isAgent} />
        <div
          className={cn(
            "mt-1 flex items-center gap-1",
            isAgent ? "justify-end" : "justify-start",
          )}
        >
          <span
            className={cn(
              "text-[10px]",
              isAgent && message.content_type !== "sticker"
                ? "text-primary-foreground/70"
                : "text-muted-foreground",
            )}
          >
            {time}
          </span>
          {isAgent && <StatusIcon status={message.status} />}
        </div>
      </div>
      {reactions && reactions.length > 0 && onToggleReaction && (
        <MessageReactions
          reactions={reactions}
          currentUserId={currentUserId}
          onToggle={onToggleReaction}
        />
      )}
    </div>
  );
});

