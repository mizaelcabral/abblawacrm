"use client"

import Link from 'next/link'
import { AppointmentsSummary } from '@/lib/dashboard/types'
import { Calendar, ArrowRight, Clock, Video, MapPin } from 'lucide-react'
import { Skeleton } from './skeleton'
import { cn } from '@/lib/utils'

export interface CubaAppointmentsWidgetProps {
  data: AppointmentsSummary | null
  loading?: boolean
}

function formatTime(timeStr: string): string {
  if (!timeStr) return '--:--'
  if (/^\d{1,2}:\d{2}(:\d{2})?$/.test(timeStr)) {
    const parts = timeStr.split(':')
    return `${parts[0].padStart(2, '0')}:${parts[1]}`
  }
  try {
    const date = new Date(timeStr)
    if (isNaN(date.getTime())) return timeStr
    return date.toLocaleTimeString('pt-BR', {
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return timeStr
  }
}

export function CubaAppointmentsWidget({
  data,
  loading = false,
}: CubaAppointmentsWidgetProps) {
  const appointments = data?.todayAppointments || []

  return (
    <div className="cuba-card p-5 flex flex-col justify-between h-full space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 pb-1 border-b border-border/40">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-2xl bg-primary/10 flex items-center justify-center shrink-0 text-primary">
            <Calendar className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-foreground">Agenda & Agendamentos</h3>
            <p className="text-xs text-muted-foreground">Compromissos agendados para hoje</p>
          </div>
        </div>

        <Link
          href="/appointments"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold text-primary bg-primary/10 hover:bg-primary/20 transition-all border border-primary/20"
        >
          <span>Ver agenda</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      </div>

      {/* Loading state vs Main content */}
      {loading ? (
        <div className="space-y-4 flex-1">
          {/* Summary bar skeleton */}
          <div className="grid grid-cols-3 gap-2.5">
            <Skeleton className="h-16 rounded-2xl" />
            <Skeleton className="h-16 rounded-2xl" />
            <Skeleton className="h-16 rounded-2xl" />
          </div>

          {/* List items skeleton */}
          <div className="space-y-2.5 pt-1">
            {Array.from({ length: 3 }).map((_, i) => (
              <div
                key={i}
                className="flex items-center justify-between p-3 rounded-2xl border border-border/40 bg-muted/20"
              >
                <div className="flex items-center gap-3 flex-1">
                  <Skeleton className="h-10 w-14 rounded-xl" />
                  <div className="space-y-1.5 flex-1">
                    <Skeleton className="h-4 w-1/2" />
                    <Skeleton className="h-3 w-1/3" />
                  </div>
                </div>
                <Skeleton className="h-5 w-16 rounded-full" />
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="space-y-4 flex-1 flex flex-col">
          {/* Summary bar */}
          <div className="grid grid-cols-3 gap-2.5">
            {/* Hoje */}
            <div className="flex flex-col justify-between p-3 rounded-2xl bg-primary/10 dark:bg-primary/15 border border-primary/20 text-primary">
              <span className="text-[11px] font-semibold tracking-tight text-primary/90">
                Hoje
              </span>
              <span className="text-xl font-extrabold tracking-tight mt-1">
                {data?.todayCount ?? 0}
              </span>
            </div>

            {/* Confirmados (Emerald) */}
            <div className="flex flex-col justify-between p-3 rounded-2xl bg-emerald-500/10 dark:bg-emerald-500/15 border border-emerald-500/20 text-emerald-700 dark:text-emerald-400">
              <span className="text-[11px] font-semibold tracking-tight text-emerald-600/90 dark:text-emerald-400/90">
                Confirmados
              </span>
              <span className="text-xl font-extrabold tracking-tight mt-1">
                {data?.confirmedCount ?? 0}
              </span>
            </div>

            {/* Pendentes (Amber) */}
            <div className="flex flex-col justify-between p-3 rounded-2xl bg-amber-500/10 dark:bg-amber-500/15 border border-amber-500/20 text-amber-700 dark:text-amber-400">
              <span className="text-[11px] font-semibold tracking-tight text-amber-600/90 dark:text-amber-400/90">
                Pendentes
              </span>
              <span className="text-xl font-extrabold tracking-tight mt-1">
                {data?.pendingCount ?? 0}
              </span>
            </div>
          </div>

          {/* Today's Timeline list */}
          <div className="flex-1 flex flex-col justify-start">
            {appointments.length === 0 ? (
              <div className="py-8 text-center text-muted-foreground text-xs flex flex-col items-center justify-center space-y-2 border border-dashed border-border/60 rounded-2xl bg-muted/10 my-auto">
                <Calendar className="w-8 h-8 opacity-40" />
                <p>Nenhum agendamento para hoje.</p>
              </div>
            ) : (
              <div className="space-y-2.5 max-h-[320px] overflow-y-auto pr-1">
                {appointments.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-start gap-3 p-3 rounded-2xl border border-border/40 bg-muted/20 hover:bg-muted/40 transition-colors"
                  >
                    {/* Time Badge */}
                    <div className="flex flex-col items-center justify-center bg-primary/10 text-primary border border-primary/20 rounded-xl px-2.5 py-1.5 text-xs font-bold shrink-0 min-w-[56px] text-center">
                      <Clock className="w-3.5 h-3.5 mb-0.5 opacity-80" />
                      <span>{formatTime(item.startTime)}</span>
                    </div>

                    {/* Content Details */}
                    <div className="flex-1 min-w-0 space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <h4 className="text-xs font-bold text-foreground truncate">
                          {item.contactName}
                        </h4>
                        {/* Status Badge */}
                        <span
                          className={cn(
                            "text-[10px] px-2 py-0.5 rounded-full font-semibold border shrink-0",
                            item.status === 'confirmed' && "bg-emerald-500/10 text-emerald-600 border-emerald-500/20 dark:text-emerald-400",
                            item.status === 'pending' && "bg-amber-500/10 text-amber-600 border-amber-500/20 dark:text-amber-400",
                            item.status === 'cancelled' && "bg-rose-500/10 text-rose-600 border-rose-500/20 dark:text-rose-400",
                            item.status === 'completed' && "bg-blue-500/10 text-blue-600 border-blue-500/20 dark:text-blue-400"
                          )}
                        >
                          {item.status === 'confirmed' && 'Confirmado'}
                          {item.status === 'pending' && 'Pendente'}
                          {item.status === 'cancelled' && 'Cancelado'}
                          {item.status === 'completed' && 'Concluído'}
                        </span>
                      </div>

                      <p className="text-xs text-muted-foreground truncate">
                        {item.serviceName}
                      </p>

                      {/* Online Link & Physical Address Badges */}
                      {(item.meetingUrl || item.locationAddress) && (
                        <div className="flex flex-wrap items-center gap-2 pt-1">
                          {item.meetingUrl && (
                            <a
                              href={item.meetingUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-lg bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20 hover:bg-indigo-500/20 transition-colors font-medium"
                            >
                              <Video className="w-3 h-3" />
                              <span>Reunião Online</span>
                            </a>
                          )}

                          {item.locationAddress && (
                            <span
                              className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-lg bg-muted text-muted-foreground border border-border/60 font-medium truncate max-w-[200px]"
                              title={item.locationAddress}
                            >
                              <MapPin className="w-3 h-3 shrink-0" />
                              <span className="truncate">{item.locationAddress}</span>
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
