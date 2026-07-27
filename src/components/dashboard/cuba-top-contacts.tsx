"use client"

import { useState } from 'react'
import Link from 'next/link'
import { ActivityItem } from '@/lib/dashboard/types'
import { Search, MessageSquare, DollarSign, UserCheck, Zap, Radio, MoreHorizontal } from 'lucide-react'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Skeleton } from './skeleton'

interface CubaTopContactsProps {
  items: ActivityItem[] | null
  loading?: boolean
}

export function CubaTopContacts({ items, loading }: CubaTopContactsProps) {
  const [searchTerm, setSearchTerm] = useState('')

  const filteredItems = (items || []).filter((item) =>
    item.text.toLowerCase().includes(searchTerm.toLowerCase())
  )

  return (
    <div className="cuba-card p-5 space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-bold text-foreground">Top Clientes & Atividades</h3>
          <p className="text-xs text-muted-foreground">Últimas interações e eventos em tempo real no CRM</p>
        </div>

        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar..."
              className="h-8 pl-8 pr-3 w-36 sm:w-44 rounded-xl border border-border/80 bg-muted/30 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
            />
          </div>
          <button className="p-1.5 rounded-xl text-muted-foreground hover:bg-muted transition-colors">
            <MoreHorizontal className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto no-scrollbar">
        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr className="border-b border-border/60 text-muted-foreground text-[11px] font-semibold uppercase tracking-wider">
              <th className="pb-3 pl-1 font-semibold">Atividade</th>
              <th className="pb-3 font-semibold text-center">Tipo</th>
              <th className="pb-3 text-right pr-1 font-semibold">Horário</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/40">
            {loading ? (
              Array.from({ length: 4 }).map((_, i) => (
                <tr key={i} className="py-2.5">
                  <td className="py-2.5 pl-1">
                    <div className="flex items-center gap-3">
                      <Skeleton className="h-8 w-8 rounded-full" />
                      <Skeleton className="h-3 w-40" />
                    </div>
                  </td>
                  <td className="py-2.5 text-center">
                    <Skeleton className="h-5 w-20 mx-auto rounded-full" />
                  </td>
                  <td className="py-2.5 pr-1 text-right">
                    <Skeleton className="h-3 w-12 ml-auto" />
                  </td>
                </tr>
              ))
            ) : filteredItems.length === 0 ? (
              <tr>
                <td colSpan={3} className="py-8 text-center text-muted-foreground text-xs">
                  Nenhuma atividade recente encontrada.
                </td>
              </tr>
            ) : (
              filteredItems.slice(0, 6).map((item) => {
                const initial = item.text.trim().charAt(0).toUpperCase() || 'A'

                return (
                  <tr
                    key={item.id}
                    onClick={() => {
                      if (item.href) window.location.href = item.href
                    }}
                    className={`group hover:bg-muted/40 transition-colors ${item.href ? 'cursor-pointer' : ''}`}
                  >
                    {/* Activity Description */}
                    <td className="py-3 pl-1">
                      <div className="flex items-center gap-3">
                        <Avatar className="h-8 w-8 border border-border/60">
                          <AvatarFallback className="bg-primary/10 text-primary font-bold text-xs">
                            {initial}
                          </AvatarFallback>
                        </Avatar>
                        <p className="font-semibold text-foreground group-hover:text-primary transition-colors truncate max-w-xs sm:max-w-md">
                          {item.text}
                        </p>
                      </div>
                    </td>

                    {/* Kind Badge */}
                    <td className="py-3 text-center">
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold capitalize bg-primary/10 text-primary">
                        {item.kind === 'message' && <MessageSquare className="w-3 h-3 text-blue-500" />}
                        {item.kind === 'deal' && <DollarSign className="w-3 h-3 text-emerald-500" />}
                        {item.kind === 'contact' && <UserCheck className="w-3 h-3 text-indigo-500" />}
                        {item.kind === 'broadcast' && <Radio className="w-3 h-3 text-amber-500" />}
                        {item.kind === 'automation' && <Zap className="w-3 h-3 text-purple-500" />}
                        <span>{item.kind}</span>
                      </span>
                    </td>

                    {/* Timestamp */}
                    <td className="py-3 pr-1 text-right text-muted-foreground text-[11px] font-medium whitespace-nowrap">
                      {new Date(item.at).toLocaleTimeString('pt-BR', {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
