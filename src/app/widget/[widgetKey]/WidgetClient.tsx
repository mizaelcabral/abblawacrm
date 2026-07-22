'use client';

import { useState, useEffect, useRef } from 'react';
import { Send, X, Loader2 } from 'lucide-react';

interface WidgetConfig {
  primary_color: string;
  title: string;
  subtitle: string;
  welcome_message: string;
  require_lead_info: boolean;
  ask_name: boolean;
  ask_email: boolean;
  ask_phone: boolean;
}

interface Message {
  id: string;
  content: string;
  direction: 'inbound' | 'outbound';
  created_at: string;
}

function MessageContent({
  content,
  primaryColor,
  isInbound,
}: {
  content: string;
  primaryColor: string;
  isInbound: boolean;
}) {
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  const urls = content.match(urlRegex) || [];

  // Extract clean text body by removing raw URLs from message text
  let cleanText = content;
  urls.forEach((url) => {
    cleanText = cleanText.replace(url, '').replace(/:\s*$/, '.').trim();
  });

  if (!cleanText) cleanText = content;

  return (
    <div className="space-y-2.5">
      <div className="whitespace-pre-wrap leading-relaxed">
        {cleanText}
      </div>

      {urls.length > 0 && (
        <div className="flex flex-col gap-2 pt-1">
          {urls.map((url, index) => {
            const isBooking = url.includes('/book/');
            const isProduct = url.includes('/shop/') || url.includes('/product/');

            let label = '🔗 Abrir Link';
            if (isBooking) label = '📅 Agendar Horário Online';
            if (isProduct) label = '🛍️ Ver Produto / Comprar';

            return (
              <a
                key={index}
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className={`flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-xs font-semibold shadow-md transition hover:opacity-90 active:scale-[0.98] ${
                  isInbound
                    ? 'bg-white/20 hover:bg-white/30 text-white'
                    : 'bg-primary text-primary-foreground hover:opacity-90'
                }`}
                style={
                  !isInbound
                    ? { backgroundColor: primaryColor, color: '#FFFFFF' }
                    : {}
                }
              >
                <span>{label}</span>
                <svg className="h-3.5 w-3.5 stroke-current" fill="none" viewBox="0 0 24 24" strokeWidth="2.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                </svg>
              </a>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function WidgetClient({
  widgetKey,
  visitorToken,
  pageUrl,
}: {
  widgetKey: string;
  visitorToken: string;
  pageUrl: string;
}) {
  const [config, setConfig] = useState<WidgetConfig | null>(null);
  const [session, setSession] = useState<any>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [identified, setIdentified] = useState(false);
  const [viewportHeight, setViewportHeight] = useState<number | null>(null);

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');

  const chatContainerRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const isAtBottomRef = useRef<boolean>(true);
  const prevCountRef = useRef<number>(0);

  // Handle dynamic visualViewport for mobile browser address bar and soft keyboard adjustments
  useEffect(() => {
    if (typeof window === 'undefined' || !window.visualViewport) return;

    const updateHeight = () => {
      if (window.visualViewport) {
        setViewportHeight(window.visualViewport.height);
      }
    };

    updateHeight();
    window.visualViewport.addEventListener('resize', updateHeight);
    window.visualViewport.addEventListener('scroll', updateHeight);

    return () => {
      window.visualViewport?.removeEventListener('resize', updateHeight);
      window.visualViewport?.removeEventListener('scroll', updateHeight);
    };
  }, []);

  const handleScroll = () => {
    if (!chatContainerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = chatContainerRef.current;
    // Consider user at bottom if within 80px threshold of bottom
    isAtBottomRef.current = scrollHeight - scrollTop - clientHeight < 80;
  };

  useEffect(() => {
    // 1) Check local storage identification cache for immediate rendering
    if (typeof window !== 'undefined') {
      const isLocallyIdentified = localStorage.getItem(`abbla_widget_identified_${widgetKey}`);
      if (isLocallyIdentified === 'true') {
        setIdentified(true);
      }
    }

    // 2) Fetch Widget Config
    fetch(`/api/widget/${widgetKey}/config`)
      .then((res) => res.json())
      .then((data) => {
        setConfig(data);
        if (!data.require_lead_info) {
          setIdentified(true);
        }
      })
      .catch((err) => console.error(err))
      .finally(() => setLoading(false));

    // 3) Create or restore visitor session
    fetch(`/api/widget/${widgetKey}/session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ visitorToken, metadata: { pageUrl } }),
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.session) {
          setSession(data.session);
          // Check if visitor has already submitted lead info previously
          if (data.session.visitor_name || data.session.visitor_email || data.session.visitor_phone) {
            setIdentified(true);
            if (typeof window !== 'undefined') {
              localStorage.setItem(`abbla_widget_identified_${widgetKey}`, 'true');
            }
          }
        }
      })
      .catch((err) => console.error(err));
  }, [widgetKey, visitorToken, pageUrl]);

  useEffect(() => {
    if (!visitorToken) return;

    const fetchMessages = () => {
      fetch(`/api/widget/${widgetKey}/messages?visitorToken=${visitorToken}`)
        .then((res) => res.json())
        .then((data) => {
          if (data.messages) setMessages(data.messages);
        })
        .catch((err) => console.error(err));
    };

    fetchMessages();
    const interval = setInterval(fetchMessages, 3000);
    return () => clearInterval(interval);
  }, [widgetKey, visitorToken]);

  useEffect(() => {
    const currentCount = messages.length;
    const isInitial = prevCountRef.current === 0 && currentCount > 0;
    const hasNewMessages = currentCount > prevCountRef.current;
    prevCountRef.current = currentCount;

    // Only auto-scroll if:
    // 1. Initial message load
    // 2. New message arrived AND user was already near the bottom
    if (isInitial || (hasNewMessages && isAtBottomRef.current)) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  const handleLeadSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await fetch(`/api/widget/${widgetKey}/session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ visitorToken, name, email, phone }),
      });
      setIdentified(true);
      if (typeof window !== 'undefined') {
        localStorage.setItem(`abbla_widget_identified_${widgetKey}`, 'true');
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim() || sending) return;

    const msgContent = text.trim();
    setText('');
    setSending(true);
    isAtBottomRef.current = true; // Force scroll to bottom on user message

    try {
      const res = await fetch(`/api/widget/${widgetKey}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ visitorToken, content: msgContent }),
      });
      const data = await res.json();
      if (data.message) {
        setMessages((prev) => [...prev, data.message]);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setSending(false);
    }
  };

  const closeWidget = () => {
    window.parent.postMessage({ type: 'ABBLA_WIDGET_CLOSE' }, '*');
  };

  if (loading || !config) {
    return (
      <div className="flex h-dvh items-center justify-center bg-white dark:bg-slate-900">
        <Loader2 className="h-6 w-6 animate-spin text-slate-500" />
      </div>
    );
  }

  const primaryColor = config.primary_color || '#0F172A';

  return (
    <div
      className="flex flex-col bg-slate-50 font-sans text-slate-900 dark:bg-slate-950 dark:text-slate-100 overflow-hidden w-full"
      style={{ height: viewportHeight ? `${viewportHeight}px` : '100dvh' }}
    >
      {/* Header with Safe Area Top Padding */}
      <div
        className="flex items-center justify-between px-4 py-3 text-white shadow-md shrink-0"
        style={{
          backgroundColor: primaryColor,
          paddingTop: 'max(0.75rem, env(safe-area-inset-top, 0.75rem))',
        }}
      >
        <div>
          <h2 className="font-bold text-base leading-tight">{config.title}</h2>
          <p className="text-xs opacity-85 leading-tight">{config.subtitle}</p>
        </div>
        <button
          onClick={closeWidget}
          className="rounded-lg p-1.5 hover:bg-white/20 transition active:scale-95 shrink-0"
          aria-label="Fechar atendimento"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      {!identified && config.require_lead_info ? (
        <form
          onSubmit={handleLeadSubmit}
          className="flex-1 p-6 flex flex-col justify-center space-y-4 overflow-y-auto"
          style={{
            paddingBottom: 'max(1.5rem, env(safe-area-inset-bottom, 1.5rem))',
          }}
        >
          <p className="text-sm text-slate-600 dark:text-slate-400 font-medium">
            Por favor, preencha seus dados para iniciar o atendimento:
          </p>
          {config.ask_name !== false && (
            <input
              type="text"
              placeholder="Seu Nome *"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-lg border border-slate-300 dark:border-slate-800 p-2.5 text-[16px] sm:text-sm bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-primary"
            />
          )}
          {config.ask_email !== false && (
            <input
              type="email"
              placeholder="Seu E-mail *"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg border border-slate-300 dark:border-slate-800 p-2.5 text-[16px] sm:text-sm bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-primary"
            />
          )}
          {config.ask_phone !== false && (
            <input
              type="tel"
              placeholder="Seu WhatsApp / Telefone *"
              required
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="w-full rounded-lg border border-slate-300 dark:border-slate-800 p-2.5 text-[16px] sm:text-sm bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-primary"
            />
          )}
          <button
            type="submit"
            className="w-full rounded-lg p-2.5 text-sm font-semibold text-white shadow transition hover:opacity-90 active:scale-[0.99]"
            style={{ backgroundColor: primaryColor }}
          >
            Iniciar Chat
          </button>
        </form>
      ) : (
        <div className="flex flex-1 flex-col justify-between overflow-hidden min-h-0">
          <div
            ref={chatContainerRef}
            onScroll={handleScroll}
            className="flex-1 overflow-y-auto p-4 space-y-3 min-h-0"
          >
            {config.welcome_message && (
              <div className="flex justify-start">
                <div className="max-w-[85%] rounded-2xl rounded-tl-none bg-white dark:bg-slate-900 p-3 text-sm shadow-sm border border-slate-200 dark:border-slate-800">
                  <MessageContent
                    content={config.welcome_message}
                    primaryColor={primaryColor}
                    isInbound={false}
                  />
                </div>
              </div>
            )}
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex ${msg.direction === 'inbound' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[85%] rounded-2xl p-3 text-sm shadow-sm ${
                    msg.direction === 'inbound'
                      ? 'rounded-tr-none text-white'
                      : 'rounded-tl-none bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800'
                  }`}
                  style={msg.direction === 'inbound' ? { backgroundColor: primaryColor } : {}}
                >
                  <MessageContent
                    content={msg.content}
                    primaryColor={primaryColor}
                    isInbound={msg.direction === 'inbound'}
                  />
                </div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>

          {/* Footer Form with Safe Area Bottom Padding */}
          <form
            onSubmit={handleSend}
            className="border-t border-slate-200 dark:border-slate-800 p-3 bg-white dark:bg-slate-900 flex items-center space-x-2 shrink-0"
            style={{
              paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom, 0.75rem))',
            }}
          >
            <input
              type="text"
              placeholder="Digite sua mensagem..."
              value={text}
              onChange={(e) => setText(e.target.value)}
              className="flex-1 rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-2 text-[16px] sm:text-sm bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:outline-none"
            />
            <button
              type="submit"
              disabled={sending || !text.trim()}
              className="rounded-lg p-2.5 text-white disabled:opacity-50 active:scale-95 shrink-0"
              style={{ backgroundColor: primaryColor }}
            >
              <Send className="h-4 w-4" />
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
