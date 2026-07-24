"use client";

import {
  useState,
  useRef,
  useCallback,
  useEffect,
  KeyboardEvent,
  ClipboardEvent,
} from "react";
import {
  Send,
  LayoutTemplate,
  Paperclip,
  Image as ImageIcon,
  Video,
  FileText,
  Mic,
  Square,
  X,
  Loader2,
  Sparkles,
  BookMarked,
  ShoppingBag,
  Calendar,
  PenTool,
  Smile,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { GatedButton } from "@/components/ui/gated-button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useAuth } from "@/hooks/use-auth";
import { createClient } from "@/lib/supabase/client";
import type { Product, ProductVariation, Conversation } from "@/types";
import { useCan } from "@/hooks/use-can";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  uploadAccountMedia,
  deleteAccountMedia,
  MEDIA_MAX_BYTES_BY_KIND,
} from "@/lib/storage/upload-media";
import { ReplyQuote } from "./reply-quote";
import { KBSearchPanel } from "@/components/knowledge-base/kb-search-panel";
import { ZapSignDialog } from "./zapsign-dialog";

/** Media content types an agent can send from the composer. */
export type ComposerMediaKind = "image" | "video" | "document" | "audio" | "sticker";

/** Supabase Storage bucket holding agent-sent chat attachments (migration 023). */
export const CHAT_MEDIA_BUCKET = "chat-media";

/** Meta caps media captions at 1024 chars. Enforced here and in the send route. */
export const MEDIA_CAPTION_MAX = 1024;

/** Hard cap on a single voice recording so it can't blow the upload/
 *  transcode limits — auto-stops the recorder when reached. */
const MAX_RECORDING_SECONDS = 5 * 60;

export interface SendMediaPayload {
  kind: ComposerMediaKind;
  /** Public chat-media URL Meta fetches at send time. */
  mediaUrl: string;
  /** Storage object path — lets the caller GC the object if the send fails. */
  path: string;
  /** Optional caption (image/video/document only). */
  caption?: string;
  /** Original file name — surfaced to the recipient for documents. */
  filename?: string;
  replyToId?: string;
}

interface ReplyDraft {
  /** Internal UUID of the message being replied to — sent back through onSend. */
  id: string;
  authorLabel: string;
  preview: string;
}

// ponytail: use generic image/* and video/* to ensure maximum compatibility with user operating systems and browsers
const PICKER_ACCEPT: Record<"image" | "video" | "document" | "sticker", string> = {
  image: "image/*",
  video: "video/*",
  document:
    "application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation,text/plain",
  sticker: "image/webp",
};

const COMPOSER_EMOJIS = [
  "😀", "😃", "😄", "😁", "😆", "😅", "😂", "🤣", "😊", "😇",
  "🙂", "🙃", "😉", "😌", "😍", "🥰", "😘", "😗", "😙", "😚",
  "😋", "😛", "😝", "😜", "🤪", "🤨", "🧐", "🤓", "😎", "🤩",
  "🥳", "😏", "😒", "😞", "😔", "😟", "😕", "🙁", "☹️", "😣",
  "😖", "😫", "😩", "🥺", "😢", "😭", "😤", "😠", "😡", "🤬",
  "🤯", "😳", "🥵", "🥶", "😱", "😨", "😰", "😥", "😓", "🤗",
  "🤔", "🤭", "🤫", "🤥", "😶", "😐", "😑", "😬", "🙄", "😯",
  "😦", "😧", "😮", "😲", "🥱", "😴", "🤤", "😪", "😵", "🤐",
  "🥴", "🤢", "🤮", "🤧", "😷", "🤒", "🤕", "🤑", "🤠", "😈",
  "👿", "👹", "👺", "🤡", "💩", "👻", "💀", "☠️", "👽", "👾",
  "🤖", "🎃", "😺", "😸", "😹", "😻", "😼", "😽", "🙀", "😿",
  "😾", "👋", "🤚", "🖐️", "✋", "🖖", "👌", "🤌", "🤏", "✌️",
  "🤞", "🤟", "🤘", "🤙", "👈", "👉", "👆", "🖕", "👇", "☝️",
  "👍", "👎", "✊", "👊", "🤛", "🤜", "👏", "🙌", "👐", "🤲",
  "🤝", "🙏", "✍️", "💅", "🤳", "💪", "🦾", "🦿", "🦵", "🦶",
  "👂", "🦻", "👃", "🧠", "🫀", "🫁", "🦷", "🦴", "👀", "👁️",
  "👅", "👄", "💋", "🩸", "❤️", "🧡", "💛", "💚", "💙", "💜",
  "🖤", "🤍", "🤎", "💔", "❤️‍🔥", "❤️‍🩹", "❣️", "💕", "💞", "💓",
  "💗", "💖", "💘", "💝", "💟"
];

interface MediaDraft {
  kind: ComposerMediaKind;
  mediaUrl: string;
  /** Storage path — used to GC the object if the draft is discarded. */
  path: string;
  filename: string;
  caption: string;
}

interface MessageComposerProps {
  conversationId: string;
  sessionExpired: boolean;
  onSend: (text: string, replyToId?: string) => void;
  onSendMedia: (payload: SendMediaPayload) => void;
  onOpenTemplates: () => void;
  replyTo?: ReplyDraft | null;
  onClearReply?: () => void;
  channel?: Conversation["channel"];
  isWhatsAppWeb?: boolean;
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/** Worker that encodes mic input to Ogg/Opus entirely in the browser
 *  (vendored from opus-recorder into /public). Recording client-side in a
 *  Meta-accepted format means no server ffmpeg / transcode step. */
const OPUS_ENCODER_PATH = "/opus/encoderWorker.min.js";

export function MessageComposer({
  conversationId,
  sessionExpired,
  onSend,
  onSendMedia,
  onOpenTemplates,
  replyTo,
  onClearReply,
  channel = "whatsapp",
  isWhatsAppWeb = false,
}: MessageComposerProps) {
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [suggestion, setSuggestion] = useState("");
  const [loadingSuggestion, setLoadingSuggestion] = useState(false);

  // E-commerce Direct Integration States
  const { accountId } = useAuth();
  const supabase = createClient();
  const [storeDialogOpen, setStoreDialogOpen] = useState(false);
  const [catalogProducts, setCatalogProducts] = useState<(Product & { variations: ProductVariation[] })[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [selectedProd, setSelectedProd] = useState<(Product & { variations: ProductVariation[] }) | null>(null);
  const [selectedVar, setSelectedVar] = useState<ProductVariation | null>(null);
  const [generatingPix, setGeneratingPix] = useState(false);

  // Service Direct Link States
  const [services, setServices] = useState<any[]>([]);
  const [servicesDialogOpen, setServicesDialogOpen] = useState(false);
  const [profileSlug, setProfileSlug] = useState<string>("");
  const [zapsignDialogOpen, setZapsignDialogOpen] = useState(false);

  useEffect(() => {
    async function loadServicesAndProfile() {
      if (!accountId) return;
      try {
        // Load current user profile slug
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const { data: prof } = await supabase
            .from('profiles')
            .select('slug')
            .eq('user_id', user.id)
            .maybeSingle();
          if (prof?.slug) {
            setProfileSlug(prof.slug);
          }
        }

        // Load services
        const { data: svcs } = await supabase
          .from('services')
          .select('*')
          .eq('account_id', accountId)
          .eq('is_active', true);
        
        if (svcs) {
          setServices(svcs);
        }
      } catch (err) {
        console.error("Failed to load services for composer shortcut:", err);
      }
    }

    loadServicesAndProfile();
  }, [accountId]);

  const handleOpenStoreDialog = useCallback(async () => {
    if (!accountId) return;
    setStoreDialogOpen(true);
    setCatalogLoading(true);
    try {
      const { data: prods } = await supabase
        .from('products')
        .select('*, variations:product_variations(*)')
        .eq('account_id', accountId)
        .eq('active', true);
      
      if (prods) {
        setCatalogProducts(prods as any[]);
        if (prods.length > 0) {
          setSelectedProd(prods[0] as any);
          if (prods[0].variations && prods[0].variations.length > 0) {
            setSelectedVar(prods[0].variations[0]);
          }
        }
      }
    } catch (err) {
      console.error(err);
    } finally {
      setCatalogLoading(false);
    }
  }, [accountId, supabase]);

  const handleSendProductLink = () => {
    if (!selectedProd) return;
    const prodSlugOrId = selectedProd.slug || selectedProd.id;
    const linkText = `Confira nosso produto *${selectedProd.name}* em nossa vitrine virtual:\n👉 https://${window.location.host}/shop/${accountId}/product/${prodSlugOrId}`;
    setText((prev) => prev ? `${prev}\n${linkText}` : linkText);
    setStoreDialogOpen(false);
    toast.success('Link do produto inserido no editor!');
  };

  const handleGenerateAndSendPix = async () => {
    if (!selectedProd || !selectedVar || !accountId) return;
    setGeneratingPix(true);
    try {
      // 1. Obter contato da conversa atual
      const { data: conv, error: convError } = await supabase
        .from('conversations')
        .select('*, contact:contacts(*)')
        .eq('id', conversationId)
        .maybeSingle();

      if (convError || !conv || !conv.contact) {
        toast.error('Erro ao buscar contato vinculado a esta conversa.');
        return;
      }

      const contact = conv.contact;

      // 2. Chamar a rota de checkout para criar o pedido e gerar cobrança Pix
      const res = await fetch('/api/ecommerce/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accountId,
          customerInfo: {
            name: contact.name || 'Cliente',
            phone: contact.phone || '',
            email: contact.email || 'cliente@email.com'
          },
          cartItems: [{
            variationId: selectedVar.id,
            quantity: 1
          }],
          shippingAddress: null
        })
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Erro ao gerar Pix');
      }

      const order = await res.json();

      // 3. Montar mensagem com QR Code e Copia e Cola
      let msg = `Olá, *${contact.name || 'Cliente'}*! Geramos uma cobrança Pix para o produto *${selectedProd.name}* no valor de *R$ ${Number(selectedVar.price).toFixed(2)}*.\n\n`;
      
      if (order.woovi_brcode) {
        msg += `🔹 *Código Copia e Cola:*\n\`${order.woovi_brcode}\`\n\n`;
      }
      
      if (order.woovi_qrcode_image) {
        msg += `🔹 *Link QR Code:*\n${order.woovi_qrcode_image}\n\n`;
      }

      const prodSlugOrId = selectedProd.slug || selectedProd.id;
      msg += `Você também pode finalizar a compra informando seus dados de entrega no link:\n👉 https://${window.location.host}/shop/${accountId}/product/${prodSlugOrId}`;

      // 4. Enviar mensagem
      onSend(msg, replyTo?.id);
      setStoreDialogOpen(false);
      toast.success('Cobrança Pix gerada e enviada com sucesso no chat!');
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || 'Erro ao gerar cobrança Pix.');
    } finally {
      setGeneratingPix(false);
    }
  };

  const [kbOpen, setKbOpen] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Media attachment state. `draft` holds an uploaded-but-not-yet-sent
  // attachment; `busy` covers the upload/transcode window.
  const [draft, setDraft] = useState<MediaDraft | null>(null);
  const [busy, setBusy] = useState(false);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const documentInputRef = useRef<HTMLInputElement>(null);
  const stickerInputRef = useRef<HTMLInputElement>(null);
  // Mirror of `draft` for the unmount cleanup, which can't read render
  // state. Kept in sync below so navigating away with a staged-but-unsent
  // attachment GCs the orphaned object.
  const draftRef = useRef<MediaDraft | null>(null);
  useEffect(() => {
    draftRef.current = draft;
  }, [draft]);

  // Best-effort GC of a staged object the user never sent. Fire-and-forget.
  const removeStaged = useCallback((path: string | undefined) => {
    if (!path) return;
    void deleteAccountMedia(CHAT_MEDIA_BUCKET, path).catch(() => {});
  }, []);

  // Voice recording state. The recorder encodes Ogg/Opus in-browser
  // (opus-recorder) so there's no server-side transcode.
  const [recording, setRecording] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const recorderRef = useRef<import("opus-recorder").default | null>(null);
  // ponytail: refs for native MediaRecorder fallback
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const cancelledRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Viewers (read-only role) can browse the inbox but never send.
  // For solo users this is always true — single-owner accounts pass
  // every capability — so the disabled branch is a no-op there.
  const canSend = useCan("send-messages");
  const readOnly = !canSend;
  // Media (like free-form text) is only allowed inside the 24h window (except for WhatsApp Web, which has no 24h window).
  const inputsDisabled = readOnly || (sessionExpired && !isWhatsAppWeb);

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  // Tear down any live recording + timer on unmount so a mid-record
  // navigation doesn't leak the mic, and GC a staged-but-unsent
  // attachment so it doesn't orphan in the bucket.
  useEffect(() => {
    return () => {
      clearTimer();
      cancelledRef.current = true;
      // stop() releases the mic stream + audio context inside opus-recorder.
      void recorderRef.current?.stop().catch(() => {});
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
        try { mediaRecorderRef.current.stop(); } catch {}
      }
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach(t => t.stop());
      }
      removeStaged(draftRef.current?.path);
    };
  }, [clearTimer, removeStaged]);

  const adjustHeight = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    // Max 4 lines (~96px)
    el.style.height = `${Math.min(el.scrollHeight, 96)}px`;
  }, []);

  useEffect(() => {
    setSuggestion("");
    setLoadingSuggestion(false);
  }, [conversationId]);

  const fetchSuggestion = useCallback(async () => {
    if (!conversationId || loadingSuggestion) return;
    setLoadingSuggestion(true);
    setSuggestion("");
    try {
      const res = await fetch(`/api/ai/suggest?conversation_id=${conversationId}`);
      if (!res.ok) {
        throw new Error("Erro ao obter sugestão da IA.");
      }
      const data = await res.json();
      if (data.suggestion) {
        setSuggestion(data.suggestion);
      } else {
        toast.error("Nenhuma sugestão gerada.");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao obter sugestão.");
    } finally {
      setLoadingSuggestion(false);
    }
  }, [conversationId, loadingSuggestion]);

  const handleSend = useCallback(async () => {
    const trimmed = text.trim();
    if (!trimmed || sending || (sessionExpired && !isWhatsAppWeb)) return;

    setSending(true);
    try {
      onSend(trimmed, replyTo?.id);
      setText("");
      if (textareaRef.current) {
        textareaRef.current.style.height = "auto";
      }
    } finally {
      setSending(false);
    }
  }, [text, sending, sessionExpired, isWhatsAppWeb, onSend, replyTo?.id]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend]
  );

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      setText(e.target.value);
      adjustHeight();
    },
    [adjustHeight]
  );

  // Upload a captured file to chat-media and stage it as a draft.
  const stageUpload = useCallback(
    async (kind: ComposerMediaKind, file: File) => {
      // Per-kind ceiling mirrors Meta's caps (image 5 MB, etc.) so we
      // reject before upload rather than orphaning an object that Meta
      // would then refuse at send.
      const max = MEDIA_MAX_BYTES_BY_KIND[kind];
      if (file.size > max) {
        const translatedKind = kind === 'image' ? 'imagem' : kind === 'video' ? 'vídeo' : kind === 'document' ? 'documento' : kind === 'sticker' ? 'figurinha' : 'áudio';
        toast.error(
          `O arquivo tem ${(file.size / 1024 / 1024).toFixed(1)} MB — o limite para ${translatedKind} é ${(max / 1024 / 1024).toFixed(2)} MB.`,
        );
        return;
      }
      setBusy(true);
      try {
        const { publicUrl, path } = await uploadAccountMedia(CHAT_MEDIA_BUCKET, file);
        // Replacing an existing draft? GC the previous object first.
        removeStaged(draftRef.current?.path);
        setDraft({ kind, mediaUrl: publicUrl, path, filename: file.name, caption: "" });
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Falha no envio.");
      } finally {
        setBusy(false);
      }
    },
    [removeStaged],
  );

  const handlePicked = useCallback(
    (kind: "image" | "video" | "document" | "sticker", file: File | undefined) => {
      if (file) void stageUpload(kind, file);
    },
    [stageUpload],
  );

  const handlePaste = useCallback(
    (e: ClipboardEvent<HTMLTextAreaElement>) => {
      const items = e.clipboardData?.items;
      if (!items) return;

      for (const item of items) {
        if (item.type.startsWith("image/")) {
          const file = item.getAsFile();
          if (file) {
            e.preventDefault();
            void stageUpload("image", file);
            break;
          }
        }
      }
    },
    [stageUpload]
  );

  // ---- Voice recording (client-side Ogg/Opus, no server transcode) ---

  // The encoded Ogg/Opus file from opus-recorder → upload as an audio
  // draft. WhatsApp renders Ogg/Opus as a playable voice note.
  const finalizeRecording = useCallback(
    async (bytes: Uint8Array, mimeType: string = "audio/ogg", ext: string = "ogg") => {
      const file = new File([bytes as unknown as BlobPart], `voice-${Date.now()}.${ext}`, {
        type: mimeType,
      });
      if (file.size === 0) return; // cancelled / empty take
      if (file.size > MEDIA_MAX_BYTES_BY_KIND.audio) {
        toast.error("A gravação é muito longa (mais de 16 MB).");
        return;
      }
      setBusy(true);
      try {
        const { publicUrl, path } = await uploadAccountMedia(CHAT_MEDIA_BUCKET, file);
        removeStaged(draftRef.current?.path);
        setDraft({ kind: "audio", mediaUrl: publicUrl, path, filename: file.name, caption: "" });
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Falha no envio.");
      } finally {
        setBusy(false);
      }
    },
    [removeStaged],
  );

  const startRecording = useCallback(async () => {
    if (inputsDisabled || busy || recording) return;
    if (!navigator.mediaDevices?.getUserMedia) {
      toast.error("A gravação de voz não é suportada neste navegador.");
      return;
    }
    cancelledRef.current = false;
    let stream: MediaStream | null = null;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;

      // Lazy-load the encoder (≈400 KB worker) only when the user records
      const { default: Recorder } = await import("opus-recorder");
      const recorder = new Recorder({
        encoderPath: OPUS_ENCODER_PATH,
        mediaStream: stream,
        numberOfChannels: 1,
        encoderApplication: 2048, // VOIP — tuned for speech
        encoderSampleRate: 48000,
        streamPages: false, // one callback with the complete file on stop
      });
      recorder.ondataavailable = (bytes) => {
        if (cancelledRef.current) return;
        void finalizeRecording(bytes, "audio/ogg", "ogg");
      };
      recorderRef.current = recorder;
      await recorder.start();
      setRecording(true);
      setRecordSeconds(0);
      timerRef.current = setInterval(() => setRecordSeconds((s) => s + 1), 1000);
    } catch {
      // ponytail: fallback to native browser MediaRecorder API
      try {
        if (!stream) {
          stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          mediaStreamRef.current = stream;
        }
        audioChunksRef.current = [];

        const isOggSupported = typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported("audio/ogg;codecs=opus");
        const isWebmOpusSupported = typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported("audio/webm;codecs=opus");
        const mimeType = isOggSupported
          ? "audio/ogg;codecs=opus"
          : isWebmOpusSupported
          ? "audio/webm;codecs=opus"
          : "audio/webm";

        const ext = isOggSupported ? "ogg" : "webm";
        const cleanMime = isOggSupported ? "audio/ogg" : "audio/webm";

        const mediaRecorder = new MediaRecorder(stream, { mimeType });
        mediaRecorderRef.current = mediaRecorder;

        mediaRecorder.ondataavailable = (e) => {
          if (e.data && e.data.size > 0) {
            audioChunksRef.current.push(e.data);
          }
        };

        mediaRecorder.onstop = () => {
          if (mediaStreamRef.current) {
            mediaStreamRef.current.getTracks().forEach((t) => t.stop());
            mediaStreamRef.current = null;
          }
          if (!cancelledRef.current && audioChunksRef.current.length > 0) {
            const blob = new Blob(audioChunksRef.current, { type: cleanMime });
            void blob.arrayBuffer().then((ab) => finalizeRecording(new Uint8Array(ab), cleanMime, ext));
          }
        };

        mediaRecorder.start();
        setRecording(true);
        setRecordSeconds(0);
        timerRef.current = setInterval(() => setRecordSeconds((s) => s + 1), 1000);
      } catch (nativeErr) {
        void recorderRef.current?.stop().catch(() => {});
        recorderRef.current = null;
        if (mediaStreamRef.current) {
          mediaStreamRef.current.getTracks().forEach((t) => t.stop());
          mediaStreamRef.current = null;
        }
        mediaRecorderRef.current = null;
        toast.error("Acesso ao microfone negado ou indisponível.");
      }
    }
  }, [inputsDisabled, busy, recording, finalizeRecording]);

  const stopRecording = useCallback(() => {
    clearTimer();
    setRecording(false);
    void recorderRef.current?.stop().catch(() => {});
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      try { mediaRecorderRef.current.stop(); } catch {}
    }
  }, [clearTimer]);

  const cancelRecording = useCallback(() => {
    cancelledRef.current = true;
    clearTimer();
    setRecording(false);
    void recorderRef.current?.stop().catch(() => {});
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      try { mediaRecorderRef.current.stop(); } catch {}
    }
  }, [clearTimer]);

  // Auto-stop at the cap so a forgotten recording can't blow the
  // upload size limit.
  useEffect(() => {
    if (recording && recordSeconds >= MAX_RECORDING_SECONDS) {
      stopRecording();
    }
  }, [recording, recordSeconds, stopRecording]);

  // ---- Draft send / discard -----------------------------------------

  const sendDraft = useCallback(() => {
    if (!draft || busy) return;
    onSendMedia({
      kind: draft.kind,
      mediaUrl: draft.mediaUrl,
      path: draft.path,
      // Audio takes no caption (Meta rejects it). Everything else: the
      // trimmed caption, or undefined when blank.
      caption:
        draft.kind === "audio" ? undefined : draft.caption.trim() || undefined,
      filename: draft.kind === "document" ? draft.filename : undefined,
      replyToId: replyTo?.id,
    });
    // The object is now owned by the sent message — clear without GC.
    setDraft(null);
    onClearReply?.();
  }, [draft, busy, onSendMedia, replyTo?.id, onClearReply]);

  // Discard GCs the staged object — it was uploaded but never sent.
  const discardDraft = useCallback(() => {
    removeStaged(draft?.path);
    setDraft(null);
  }, [draft?.path, removeStaged]);

  const setCaption = useCallback((caption: string) => {
    setDraft((d) => (d ? { ...d, caption } : d));
  }, []);

  // ---- Render --------------------------------------------------------

  return (
    <div className="border-t border-border bg-card p-3">
      {replyTo && (
        <div className="mb-2">
          <ReplyQuote
            authorLabel={replyTo.authorLabel}
            preview={replyTo.preview}
            onDismiss={onClearReply}
          />
        </div>
      )}
      {sessionExpired && !isWhatsAppWeb && (
        <div className="mb-2 flex items-center justify-between rounded-lg bg-amber-500/10 px-3 py-2">
          <p className="text-xs text-amber-400">
            {channel === 'whatsapp'
              ? "Sessão de 24 horas expirada. Use um modelo para reatar."
              : "Sessão de 24 horas expirada. Aguarde o cliente enviar uma mensagem para responder."}
          </p>
          {channel === 'whatsapp' && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs text-amber-400 hover:text-amber-300"
              onClick={onOpenTemplates}
            >
              <LayoutTemplate className="mr-1 h-3 w-3" />
              Modelos
            </Button>
          )}
        </div>
      )}

      {loadingSuggestion && (
        <div className="mb-2 flex items-center gap-2 rounded-lg bg-primary/5 border border-primary/10 px-3 py-2 text-xs text-primary animate-pulse">
          <Loader2 className="h-3 w-3 animate-spin text-primary" />
          <span>Obtendo sugestão inteligente da IA...</span>
        </div>
      )}

      {suggestion && !loadingSuggestion && (
        <div className="mb-2 flex flex-col gap-2 rounded-lg border border-primary/20 bg-primary/5 p-3 text-xs text-foreground animate-in fade-in-50 duration-200">
          <div className="flex items-center justify-between border-b border-primary/10 pb-1.5">
            <span className="flex items-center gap-1 font-semibold text-primary">
              <Sparkles className="h-3 w-3" /> Sugestão da IA
            </span>
            <button
              onClick={() => setSuggestion("")}
              className="text-muted-foreground hover:text-foreground"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
          <p className="whitespace-pre-wrap leading-relaxed text-muted-foreground">{suggestion}</p>
          <div className="flex gap-2 justify-end pt-1">
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs border-primary/20 text-primary hover:bg-primary/10 hover:text-primary"
              onClick={() => {
                setText(suggestion);
                setSuggestion("");
                if (textareaRef.current) {
                  textareaRef.current.value = suggestion;
                  const el = textareaRef.current;
                  el.style.height = "auto";
                  el.style.height = `${Math.min(el.scrollHeight, 96)}px`;
                }
              }}
            >
              Copiar para editor
            </Button>
            <Button
              variant="default"
              size="sm"
              className="h-7 text-xs bg-primary hover:bg-primary/90 text-primary-foreground"
              onClick={() => {
                onSend(suggestion, replyTo?.id);
                setSuggestion("");
              }}
            >
              Enviar agora
            </Button>
          </div>
        </div>
      )}

      {/* Hidden file inputs driven by the attach menu. */}
      <input
        ref={imageInputRef}
        type="file"
        accept={PICKER_ACCEPT.image}
        className="hidden"
        onChange={(e) => {
          handlePicked("image", e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      <input
        ref={videoInputRef}
        type="file"
        accept={PICKER_ACCEPT.video}
        className="hidden"
        onChange={(e) => {
          handlePicked("video", e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      <input
        ref={documentInputRef}
        type="file"
        accept={PICKER_ACCEPT.document}
        className="hidden"
        onChange={(e) => {
          handlePicked("document", e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      <input
        ref={stickerInputRef}
        type="file"
        accept={PICKER_ACCEPT.sticker}
        className="hidden"
        onChange={(e) => {
          handlePicked("sticker", e.target.files?.[0]);
          e.target.value = "";
        }}
      />

      {draft ? (
        <MediaDraftPreview
          draft={draft}
          busy={busy}
          readOnly={readOnly}
          onCaptionChange={setCaption}
          onDiscard={discardDraft}
          onSend={sendDraft}
        />
      ) : recording ? (
        // Recording bar — replaces the composer while the mic is live.
        <div className="flex items-center gap-3 rounded-xl border border-border bg-muted px-4 py-2.5">
          <span className="flex h-2.5 w-2.5 shrink-0 animate-pulse rounded-full bg-red-500" />
          <span className="flex-1 text-sm text-foreground">
            Gravando… {formatDuration(recordSeconds)} /{" "}
            {formatDuration(MAX_RECORDING_SECONDS)}
          </span>
          <button
            type="button"
            onClick={cancelRecording}
            className="rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-card hover:text-foreground"
          >
            Cancelar
          </button>
          <Button
            size="sm"
            onClick={stopRecording}
            className="h-9 w-9 shrink-0 bg-primary p-0 hover:bg-primary/90"
            title="Parar e anexar"
          >
            <Square className="h-4 w-4" />
          </Button>
        </div>
      ) : (
        <div className="relative flex items-end gap-2">
          {/* KB search panel — floats above the composer row */}
          <KBSearchPanel
            open={kbOpen}
            onClose={() => setKbOpen(false)}
            onInsert={(content) => {
              setText((prev) => (prev ? prev + "\n" + content : content));
              setTimeout(() => {
                const el = textareaRef.current;
                if (el) {
                  el.style.height = "auto";
                  el.style.height = `${Math.min(el.scrollHeight, 96)}px`;
                  el.focus();
                }
              }, 50);
            }}
          />
          {/* Attach menu — photo / video / document / voice / sticker. */}
          <DropdownMenu>
            <DropdownMenuTrigger
              disabled={inputsDisabled || busy}
              title={
                readOnly
                  ? "Apenas visualização — visualizadores podem navegar, mas não responder"
                  : inputsDisabled
                    ? undefined
                    : "Anexar mídia"
              }
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md p-0 text-muted-foreground hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Paperclip className="h-4 w-4" />
              )}
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="border-border bg-popover">
              <DropdownMenuItem onClick={() => imageInputRef.current?.click()}>
                <ImageIcon className="mr-2 h-4 w-4" />
                Foto
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => videoInputRef.current?.click()}>
                <Video className="mr-2 h-4 w-4" />
                Vídeo
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => documentInputRef.current?.click()}>
                <FileText className="mr-2 h-4 w-4" />
                Documento
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => stickerInputRef.current?.click()}>
                <Smile className="mr-2 h-4 w-4" />
                Figurinha (Sticker)
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => void startRecording()}>
                <Mic className="mr-2 h-4 w-4" />
                Mensagem de voz
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {channel === 'whatsapp' && (
            <GatedButton
              variant="ghost"
              size="sm"
              canAct={!readOnly}
              gateReason="enviar mensagens"
              title={readOnly ? undefined : "Enviar modelo"}
              className="h-9 w-9 shrink-0 p-0 text-muted-foreground hover:text-foreground"
              onClick={onOpenTemplates}
            >
              <LayoutTemplate className="h-4 w-4" />
            </GatedButton>
          )}

          <GatedButton
            variant="ghost"
            size="sm"
            canAct={!readOnly}
            gateReason="enviar mensagens"
            title={readOnly ? undefined : "Base de Conhecimento"}
            className={cn(
              "h-9 w-9 shrink-0 p-0 text-muted-foreground hover:text-foreground",
              kbOpen && "text-primary bg-primary/10"
            )}
            onClick={() => setKbOpen((v) => !v)}
            disabled={inputsDisabled}
          >
            <BookMarked className="h-4 w-4" />
          </GatedButton>

          <GatedButton
            variant="ghost"
            size="sm"
            canAct={!readOnly}
            gateReason="enviar mensagens"
            title={readOnly ? undefined : "Obter sugestão da IA"}
            className={cn(
              "h-9 w-9 shrink-0 p-0 text-muted-foreground hover:text-foreground",
              loadingSuggestion && "text-primary animate-pulse"
            )}
            onClick={fetchSuggestion}
            disabled={inputsDisabled || loadingSuggestion}
          >
            <Sparkles className="h-4 w-4" />
          </GatedButton>

          <GatedButton
            variant="ghost"
            size="sm"
            canAct={!readOnly}
            gateReason="enviar mensagens"
            title={readOnly ? undefined : "Produtos & Link de Vendas"}
            className="h-9 w-9 shrink-0 p-0 text-muted-foreground hover:text-foreground"
            onClick={handleOpenStoreDialog}
            disabled={inputsDisabled}
          >
            <ShoppingBag className="h-4 w-4" />
          </GatedButton>

          <GatedButton
            variant="ghost"
            size="sm"
            canAct={!readOnly}
            gateReason="enviar mensagens"
            title={readOnly ? undefined : "Serviços & Links de Agendamento"}
            className="h-9 w-9 shrink-0 p-0 text-muted-foreground hover:text-foreground"
            onClick={() => setServicesDialogOpen(true)}
            disabled={inputsDisabled}
          >
            <Calendar className="h-4 w-4" />
          </GatedButton>

          <GatedButton
            variant="ghost"
            size="sm"
            canAct={!readOnly}
            gateReason="enviar mensagens"
            title={readOnly ? undefined : "Criar & Enviar Assinatura (ZapSign)"}
            className="h-9 w-9 shrink-0 p-0 text-muted-foreground hover:text-foreground"
            onClick={() => setZapsignDialogOpen(true)}
            disabled={inputsDisabled}
          >
            <PenTool className="h-4 w-4" />
          </GatedButton>

          {/* Emoji Picker */}
          <Popover>
            <PopoverTrigger
              title={readOnly ? "Apenas visualização — seu papel não pode enviar mensagens" : "Inserir emoji"}
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md p-0 text-muted-foreground hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
              disabled={inputsDisabled || readOnly}
            >
              <Smile className="h-4 w-4" />
            </PopoverTrigger>
            <PopoverContent
              side="top"
              align="start"
              className="w-72 p-2 bg-popover border border-border rounded-xl shadow-lg"
            >
              <div className="grid grid-cols-8 gap-1 max-h-48 overflow-y-auto pr-1">
                {COMPOSER_EMOJIS.map((emoji) => (
                  <button
                    key={emoji}
                    type="button"
                    onClick={() => {
                      setText((prev) => prev + emoji);
                      if (textareaRef.current) {
                        textareaRef.current.focus();
                      }
                    }}
                    className="flex h-7 w-7 items-center justify-center rounded text-base hover:bg-muted active:scale-95 transition-all"
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            </PopoverContent>
          </Popover>

          <textarea
            ref={textareaRef}
            value={text}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            placeholder={
              readOnly
                ? "Apenas visualização — visualizadores podem navegar, mas não responder"
                : sessionExpired && !isWhatsAppWeb
                  ? channel === 'whatsapp'
                    ? "Sessão expirada - use um modelo"
                    : "Sessão expirada - aguarde o cliente entrar em contato"
                  : channel === 'messenger'
                    ? "Respondendo via Messenger... (Shift+Enter para nova linha)"
                    : channel === 'instagram'
                      ? "Respondendo via Instagram... (Shift+Enter para nova linha)"
                      : channel === 'telegram'
                        ? "Respondendo via Telegram... (Shift+Enter para nova linha)"
                        : "Digite uma mensagem... (Shift+Enter para nova linha)"
            }
            disabled={(sessionExpired && !isWhatsAppWeb) || readOnly}
            rows={1}
            // Textarea keeps its own inline title — the GatedButton
            // wrapping pattern doesn't apply to non-button inputs.
            // The placeholder text also surfaces the read-only state.
            title={readOnly ? "Apenas visualização — seu papel não pode enviar mensagens" : undefined}
            className={cn(
              "flex-1 resize-none rounded-xl border border-border bg-muted px-4 py-2.5 text-sm text-foreground placeholder-muted-foreground outline-none transition-colors focus:border-primary/50",
              ((sessionExpired && !isWhatsAppWeb) || readOnly) && "cursor-not-allowed opacity-50"
            )}
          />

          <GatedButton
            size="sm"
            canAct={!readOnly}
            gateReason="enviar mensagens"
            disabled={!text.trim() || (sessionExpired && !isWhatsAppWeb) || sending}
            onClick={handleSend}
            className="h-9 w-9 shrink-0 bg-primary p-0 hover:bg-primary/90 disabled:opacity-40"
          >
            <Send className="h-4 w-4" />
          </GatedButton>
        </div>
      )}

      {/* Hint sits outside the flex row so its height doesn't push
          `items-end` buttons below the textarea. Indented to line up
          under the textarea left edge. */}
      {!draft && !recording && (
        <p className="mt-1 pl-[5.5rem] text-[10px] text-muted-foreground">
          Digite &apos;/&apos; para respostas rápidas
        </p>
      )}

      {/* Dialog de Integração de Produtos & Pix Rápido */}
      <Dialog open={storeDialogOpen} onOpenChange={setStoreDialogOpen}>
        <DialogContent className="max-w-md bg-card border-border">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-foreground font-bold">
              <ShoppingBag className="h-5 w-5 text-primary" />
              Enviar Link ou Pix de Produto
            </DialogTitle>
          </DialogHeader>

          {catalogLoading ? (
            <div className="flex h-36 items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-primary animate-pulse" />
            </div>
          ) : catalogProducts.length === 0 ? (
            <div className="text-center py-6 text-sm text-muted-foreground">
              Nenhum produto cadastrado ou ativo na loja.
            </div>
          ) : (
            <div className="space-y-4 pt-2">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-muted-foreground">Selecione o Produto:</label>
                <select
                  className="w-full bg-muted border border-border rounded-xl p-2.5 text-sm text-foreground focus:outline-none"
                  value={selectedProd?.id || ''}
                  onChange={(e) => {
                    const matched = catalogProducts.find(p => p.id === e.target.value);
                    if (matched) {
                      setSelectedProd(matched);
                      setSelectedVar(matched.variations?.[0] || null);
                    }
                  }}
                >
                  {catalogProducts.map(p => (
                    <option key={p.id} value={p.id}>{p.name} ({p.product_type === 'digital' ? 'Digital' : 'Físico'})</option>
                  ))}
                </select>
              </div>

              {selectedProd && selectedProd.variations && selectedProd.variations.length > 0 && (
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-muted-foreground">Variação / Preço:</label>
                  <select
                    className="w-full bg-muted border border-border rounded-xl p-2.5 text-sm text-foreground focus:outline-none"
                    value={selectedVar?.id || ''}
                    onChange={(e) => {
                      const matched = selectedProd.variations.find(v => v.id === e.target.value);
                      if (matched) setSelectedVar(matched);
                    }}
                  >
                    {selectedProd.variations.map(v => {
                      const attrs = Object.values(v.attributes).join(' / ') || 'Única';
                      return (
                        <option key={v.id} value={v.id}>
                          {attrs} - R$ {Number(v.price).toFixed(2)}
                        </option>
                      );
                    })}
                  </select>
                </div>
              )}

              <div className="flex gap-2 pt-2 border-t border-border">
                <Button
                  variant="outline"
                  className="flex-1 rounded-xl text-xs"
                  onClick={handleSendProductLink}
                >
                  Inserir Link no Editor
                </Button>
                <Button
                  className="flex-1 rounded-xl text-xs"
                  onClick={handleGenerateAndSendPix}
                  disabled={generatingPix}
                >
                  {generatingPix ? 'Gerando Pix...' : 'Gerar & Enviar Pix'}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={servicesDialogOpen} onOpenChange={setServicesDialogOpen}>
        <DialogContent className="max-w-md border-border bg-card">
          <DialogHeader>
            <DialogTitle>Serviços & Links de Agendamento</DialogTitle>
          </DialogHeader>
          <div className="py-2 space-y-4">
            <p className="text-xs text-muted-foreground">
              Selecione um serviço ativo para inserir o link direto de agendamento na conversa.
            </p>
            
            {services.length === 0 ? (
              <p className="text-sm text-center py-6 text-muted-foreground italic">
                Nenhum serviço cadastrado ou ativo encontrado.
              </p>
            ) : (
              <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
                {services.map((svc) => (
                  <div
                    key={svc.id}
                    onClick={() => {
                      const baseUrl = window.location.origin;
                      const slugPart = profileSlug || svc.account_id;
                      const bookingUrl = `${baseUrl}/book/${slugPart}`;
                      const msg = `Olá! Você pode realizar o agendamento de "${svc.name}" pelo link: ${bookingUrl}`;
                      setText((prev) => (prev ? `${prev}\n${msg}` : msg));
                      setServicesDialogOpen(false);
                      toast.success("Link do serviço inserido!");
                    }}
                    className="flex justify-between items-center p-3 rounded-xl border border-border bg-muted/40 hover:bg-muted/80 cursor-pointer transition-colors"
                  >
                    <div className="space-y-1">
                      <p className="text-sm font-semibold text-foreground">{svc.name}</p>
                      <p className="text-xs text-muted-foreground">{svc.duration_minutes} min</p>
                    </div>
                    <span className="text-xs font-semibold text-primary">
                      R$ {Number(svc.price).toFixed(2)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <ZapSignDialog
        open={zapsignDialogOpen}
        onClose={() => setZapsignDialogOpen(false)}
        conversationId={conversationId}
        onSendMsg={(text) => onSend(text)}
      />
    </div>
  );
}

/**
 * Staged-attachment preview with caption + send/discard. Declared at
 * module scope (not nested in MessageComposer) so React keeps it mounted
 * across the parent's re-renders — a nested component would remount the
 * caption input on every keystroke and drop focus.
 */
function MediaDraftPreview({
  draft,
  busy,
  readOnly,
  onCaptionChange,
  onDiscard,
  onSend,
}: {
  draft: MediaDraft;
  busy: boolean;
  readOnly: boolean;
  onCaptionChange: (caption: string) => void;
  onDiscard: () => void;
  onSend: () => void;
}) {
  return (
    <div className="rounded-xl border border-border bg-muted/40 p-3">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          {draft.kind === "image" && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={draft.mediaUrl}
              alt={draft.filename}
              className="max-h-40 rounded-lg object-cover"
            />
          )}
          {draft.kind === "sticker" && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={draft.mediaUrl}
              alt={draft.filename}
              className="max-h-32 max-w-32 rounded-lg object-contain bg-transparent border border-dashed border-border p-1"
            />
          )}
          {draft.kind === "video" && (
            <video src={draft.mediaUrl} controls className="max-h-40 rounded-lg" />
          )}
          {draft.kind === "audio" && (
            <audio src={draft.mediaUrl} controls className="w-full" />
          )}
          {draft.kind === "document" && (
            <div className="flex items-center gap-2 text-sm text-foreground">
              <FileText className="h-5 w-5 shrink-0 text-muted-foreground" />
              <span className="truncate">{draft.filename}</span>
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={onDiscard}
          aria-label="Remover anexo"
          className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="mt-2 flex items-end gap-2">
        {draft.kind !== "audio" && draft.kind !== "sticker" && (
          <input
            value={draft.caption}
            maxLength={MEDIA_CAPTION_MAX}
            onChange={(e) => onCaptionChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                onSend();
              }
            }}
            placeholder="Adicione uma legenda…"
            className="flex-1 rounded-xl border border-border bg-muted px-4 py-2.5 text-sm text-foreground placeholder-muted-foreground outline-none transition-colors focus:border-primary/50"
          />
        )}
        <GatedButton
          size="sm"
          canAct={!readOnly}
          gateReason="enviar mensagens"
          disabled={busy}
          onClick={onSend}
          className={cn(
            "h-9 w-9 shrink-0 bg-primary p-0 hover:bg-primary/90 disabled:opacity-40",
            (draft.kind === "audio" || draft.kind === "sticker") && "ml-auto",
          )}
        >
          <Send className="h-4 w-4" />
        </GatedButton>
      </div>
    </div>
  );
}
