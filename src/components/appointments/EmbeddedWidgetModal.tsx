'use client'

import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Copy, Check, Code, ExternalLink, Globe } from 'lucide-react'
import { toast } from 'sonner'

interface EmbeddedWidgetModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  bookingSlug: string
}

export function EmbeddedWidgetModal({ open, onOpenChange, bookingSlug }: EmbeddedWidgetModalProps) {
  const [copiedType, setCopiedType] = useState<'iframe' | 'script' | 'link' | null>(null)
  const baseUrl = typeof window !== 'undefined' ? window.location.origin : 'https://app.abblaw.com.br'

  const publicUrl = `${baseUrl}/book/${bookingSlug || 'agenda'}`

  const iframeSnippet = `<iframe\n  src="${publicUrl}?embed=true"\n  width="100%"\n  height="700px"\n  frameborder="0"\n  style="border:0; border-radius: 16px; overflow: hidden;"\n  allow="payment"\n></iframe>`

  const scriptSnippet = `<div id="abbla-booking-widget"></div>\n<script\n  src="${baseUrl}/widget/embed.js"\n  data-slug="${bookingSlug || 'agenda'}"\n  data-target="abbla-booking-widget"\n  async\n></script>`

  const handleCopy = (text: string, type: 'iframe' | 'script' | 'link') => {
    navigator.clipboard.writeText(text)
    setCopiedType(type)
    toast.success('Código copiado para a área de transferência!')
    setTimeout(() => setCopiedType(null), 2000)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-2xl w-full p-6"
        style={{ maxWidth: '672px', width: 'calc(100vw - 2rem)' }}
      >
        <DialogHeader className="pr-10">
          <DialogTitle className="flex items-center gap-2 text-xl font-semibold pr-2">
            <Code className="h-5 w-5 text-primary shrink-0" />
            <span>Widget de Agendamento Embeddable</span>
          </DialogTitle>
          <DialogDescription className="mt-1 text-sm">
            Incorpore este formulário de agendamento diretamente no seu site, landing page ou WordPress.
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="iframe" className="w-full mt-3">
          <TabsList className="grid grid-cols-3 mb-4 w-full">
            <TabsTrigger value="iframe">iFrame Embed</TabsTrigger>
            <TabsTrigger value="script">Script Tag (JS)</TabsTrigger>
            <TabsTrigger value="link">Link Direto</TabsTrigger>
          </TabsList>

          <TabsContent value="iframe" className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Copie o código abaixo e cole no HTML da sua Landing Page ou elemento HTML/Elementor do seu site:
            </p>
            <div className="relative p-3 bg-zinc-950 text-zinc-100 rounded-lg text-xs font-mono border overflow-x-auto max-w-full">
              <pre className="whitespace-pre-wrap break-all leading-relaxed">{iframeSnippet}</pre>
            </div>
            <Button
              onClick={() => handleCopy(iframeSnippet, 'iframe')}
              className="w-full flex items-center gap-2"
              variant="outline"
            >
              {copiedType === 'iframe' ? <Check className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />}
              {copiedType === 'iframe' ? 'Copiado!' : 'Copiar iFrame Embed'}
            </Button>
          </TabsContent>

          <TabsContent value="script" className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Utilize o script tag para renderização dinâmica em container do seu site:
            </p>
            <div className="relative p-3 bg-zinc-950 text-zinc-100 rounded-lg text-xs font-mono border overflow-x-auto max-w-full">
              <pre className="whitespace-pre-wrap break-all leading-relaxed">{scriptSnippet}</pre>
            </div>
            <Button
              onClick={() => handleCopy(scriptSnippet, 'script')}
              className="w-full flex items-center gap-2"
              variant="outline"
            >
              {copiedType === 'script' ? <Check className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />}
              {copiedType === 'script' ? 'Copiado!' : 'Copiar Script Javascript'}
            </Button>
          </TabsContent>

          <TabsContent value="link" className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Link direto da sua página pública de agendamento para compartilhar no WhatsApp, Instagram ou Bio:
            </p>
            <div className="p-3 bg-muted rounded-lg text-xs font-mono break-all flex items-center justify-between gap-2 overflow-hidden border">
              <span className="truncate min-w-0">{publicUrl}</span>
              <a href={publicUrl} target="_blank" rel="noreferrer" className="text-primary hover:underline shrink-0 flex items-center">
                <ExternalLink className="h-4 w-4 ml-1" />
              </a>
            </div>
            <Button
              onClick={() => handleCopy(publicUrl, 'link')}
              className="w-full flex items-center gap-2"
              variant="outline"
            >
              {copiedType === 'link' ? <Check className="h-4 w-4 text-emerald-500" /> : <Globe className="h-4 w-4" />}
              {copiedType === 'link' ? 'Copiado!' : 'Copiar URL da Página'}
            </Button>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}
