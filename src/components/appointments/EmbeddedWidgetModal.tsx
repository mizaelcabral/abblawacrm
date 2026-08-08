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
  const widgetUrl = `${baseUrl}/widget/booking-${bookingSlug || 'agenda'}`

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
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <Code className="h-5 w-5 text-primary" /> Widget de Agendamento Embeddable
          </DialogTitle>
          <DialogDescription>
            Incorpore este formulário de agendamento diretamente no seu site, landing page ou WordPress.
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="iframe" className="w-full mt-4">
          <TabsList className="grid grid-cols-3 mb-4">
            <TabsTrigger value="iframe">iFrame Embed</TabsTrigger>
            <TabsTrigger value="script">Script Tag (JS)</TabsTrigger>
            <TabsTrigger value="link">Link Direto</TabsTrigger>
          </TabsList>

          <TabsContent value="iframe" className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Copie o código abaixo e cole no HTML da sua Landing Page ou elemento HTML/Elementor do seu site:
            </p>
            <div className="relative p-3 bg-zinc-950 text-zinc-100 rounded-lg text-xs font-mono overflow-x-auto border">
              <pre>{iframeSnippet}</pre>
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
            <div className="relative p-3 bg-zinc-950 text-zinc-100 rounded-lg text-xs font-mono overflow-x-auto border">
              <pre>{scriptSnippet}</pre>
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
            <div className="p-3 bg-muted rounded-lg text-xs font-mono break-all flex items-center justify-between">
              <span>{publicUrl}</span>
              <a href={publicUrl} target="_blank" rel="noreferrer" className="text-primary hover:underline">
                <ExternalLink className="h-4 w-4 inline ml-2" />
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
