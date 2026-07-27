"use client"

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useAuth } from '@/hooks/use-auth'
import { Clock, Send, UserPlus, Sparkles } from 'lucide-react'

export function CubaWelcomeCard() {
  const { profile } = useAuth()
  const [timeStr, setTimeStr] = useState<string>('')

  const userName =
    profile?.full_name?.split(' ')[0] ||
    profile?.email?.split('@')[0] ||
    'Atendente'

  useEffect(() => {
    const updateTime = () => {
      const now = new Date()
      setTimeStr(
        now.toLocaleTimeString('pt-BR', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        })
      )
    }
    updateTime()
    const timer = setInterval(updateTime, 1000)
    return () => clearInterval(timer)
  }, [])

  return (
    <div className="relative overflow-hidden rounded-3xl cuba-gradient-welcome p-6 sm:p-8 text-white shadow-xl">
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

        {/* Right Column: Digital Clock Widget */}
        <div className="self-end md:self-center flex flex-col items-center justify-center p-4 rounded-2xl bg-white/15 backdrop-blur-md border border-white/20 min-w-[140px] text-center shadow-inner">
          <div className="flex items-center gap-1.5 text-amber-300 text-xs font-medium mb-1">
            <Clock className="w-4 h-4" />
            <span>Horário Atual</span>
          </div>
          <span className="text-xl sm:text-2xl font-black tracking-wider text-white font-mono">
            {timeStr || '12:00:00'}
          </span>
          <span className="text-[10px] uppercase tracking-widest text-white/70 mt-1 font-semibold">
            {new Date().toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short' })}
          </span>
        </div>
      </div>
    </div>
  )
}
