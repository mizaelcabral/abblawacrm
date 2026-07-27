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
    <div className="relative overflow-hidden rounded-3xl cuba-gradient-welcome p-6 sm:p-8 text-white shadow-xl h-full flex flex-col justify-between">
      {/* Decorative background circles */}
      <div className="absolute -right-12 -bottom-12 w-64 h-64 rounded-full bg-white/10 blur-2xl pointer-events-none" />
      <div className="absolute right-32 -top-12 w-48 h-48 rounded-full bg-indigo-400/20 blur-xl pointer-events-none" />

      <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
        {/* Left Column: Greeting & Action Buttons */}
        <div className="max-w-lg space-y-3">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/15 backdrop-blur-xs text-xs font-semibold text-white/95">
            <Sparkles className="w-3.5 h-3.5 text-amber-300" />
            <span>Painel Principal ABBLA</span>
          </div>

          <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white">
            Bem-vindo de volta, {userName}! 👋
          </h2>

          <p className="text-xs sm:text-sm text-white/85 leading-relaxed">
            Aqui está o acompanhamento em tempo real das suas conversas no WhatsApp, contatos, transmissões e funil de vendas hoje.
          </p>

          <div className="flex flex-wrap items-center gap-3 pt-2">
            <Link
              href="/broadcasts"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-white text-indigo-700 text-xs font-bold shadow-md hover:bg-white/95 hover:shadow-lg transition-all"
            >
              <Send className="w-3.5 h-3.5" />
              Nova Transmissão
            </Link>
            <Link
              href="/contacts"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-white/20 hover:bg-white/30 backdrop-blur-xs text-white text-xs font-semibold transition-all border border-white/25"
            >
              <UserPlus className="w-3.5 h-3.5" />
              Cadastrar Lead
            </Link>
          </div>
        </div>

        {/* Right Column: Floating Vector Woman PNG Illustration */}
        <div className="self-center md:self-auto flex items-center justify-center shrink-0 max-w-[240px] sm:max-w-[300px] md:max-w-[340px] pointer-events-none select-none">
          <img
            src="/images/vector-women-abbla.png"
            alt="Ilustração ABBLA CRM"
            className="w-full h-auto object-contain animate-float drop-shadow-2xl"
          />
        </div>
      </div>
    </div>
  )
}
