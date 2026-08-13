"use client"

import Link from 'next/link'
import { useAuth } from '@/hooks/use-auth'
import { Send, UserPlus, Sparkles } from 'lucide-react'

export function CubaWelcomeCard() {
  const { profile } = useAuth()

  const userName =
    profile?.full_name?.split(' ')[0] ||
    profile?.email?.split('@')[0] ||
    'Atendente'

  return (
    <div className="relative overflow-hidden rounded-3xl cuba-gradient-welcome p-6 sm:p-7 text-white shadow-xl h-full flex flex-col justify-between">
      {/* Decorative background elements */}
      <div className="absolute -right-8 -bottom-8 w-60 h-60 rounded-full bg-white/10 blur-2xl pointer-events-none" />
      <div className="absolute right-40 -top-8 w-44 h-44 rounded-full bg-indigo-300/20 blur-xl pointer-events-none" />

      <div className="relative z-10 flex flex-col sm:flex-row items-center justify-between gap-5 h-full">
        {/* Left Column: Greeting & Action Buttons */}
        <div className="flex-1 space-y-3 max-w-md">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/15 backdrop-blur-xs text-xs font-semibold text-white/95">
            <Sparkles className="w-3.5 h-3.5 text-amber-300" />
            <span>Painel Principal ABBLA</span>
          </div>

          <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white leading-tight">
            Bem-vindo de volta, {userName}! 👋
          </h2>

          <p className="text-xs sm:text-sm text-white/85 leading-relaxed">
            Aqui está o acompanhamento em tempo real das suas conversas no WhatsApp, contatos, transmissões e funil de vendas hoje.
          </p>

          <div className="flex flex-wrap items-center gap-3 pt-1">
            <Link
              href="/broadcasts"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-white text-indigo-700 text-xs font-bold shadow-md hover:bg-white/95 hover:shadow-lg transition-all"
            >
              <Send className="w-3.5 h-3.5" />
              <span>Nova Transmissão</span>
            </Link>
            <Link
              href="/contacts"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-white/20 hover:bg-white/30 backdrop-blur-xs text-white text-xs font-semibold transition-all border border-white/25"
            >
              <UserPlus className="w-3.5 h-3.5" />
              <span>Cadastrar Lead</span>
            </Link>
          </div>
        </div>

        {/* Right Column: Floating Vector Woman PNG Illustration */}
        <div className="shrink-0 max-w-[190px] sm:max-w-[220px] md:max-w-[240px] self-end sm:self-center pointer-events-none select-none">
          <img
            src="/images/vector-women-abbla.png"
            alt="Ilustração ABBLA CRM"
            className="w-full h-auto object-contain animate-float drop-shadow-xl max-h-[190px]"
          />
        </div>
      </div>
    </div>
  )
}
