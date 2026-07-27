"use client"

import { useState } from 'react'
import { Flame, X, ArrowRight } from 'lucide-react'

export function CubaAnnouncementBanner() {
  const [dismissed, setDismissed] = useState(false)

  if (dismissed) return null

  return (
    <div className="bg-gradient-to-r from-purple-600 via-indigo-600 to-blue-600 text-white text-xs py-1.5 px-4 flex items-center justify-between shadow-sm transition-all duration-200">
      <div className="flex items-center gap-2 mx-auto">
        <span className="flex items-center gap-1 font-semibold bg-white/20 px-2 py-0.5 rounded-full text-[11px] backdrop-blur-xs">
          <Flame className="w-3.5 h-3.5 text-amber-300 animate-pulse" />
          Atualização
        </span>
        <span className="font-medium">
          ABBLA WACRM v0.2.2 com layout Cuba Admin ativo!
        </span>
        <a
          href="/dashboard"
          className="inline-flex items-center gap-1 font-semibold underline underline-offset-2 hover:text-amber-200 transition-colors ml-1"
        >
          Explorar CRM
          <ArrowRight className="w-3 h-3" />
        </a>
      </div>
      <button
        onClick={() => setDismissed(true)}
        className="text-white/80 hover:text-white p-0.5 rounded-md hover:bg-white/10 transition-colors"
        title="Fechar aviso"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  )
}
