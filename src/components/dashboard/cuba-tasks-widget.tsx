"use client"

import { useState } from 'react'
import Link from 'next/link'
import { TasksSummary } from '@/lib/dashboard/types'
import { CheckSquare, ArrowRight, Clock, User, CheckCircle2 } from 'lucide-react'
import { Checkbox } from '@/components/ui/checkbox'
import { Skeleton } from './skeleton'
import { cn } from '@/lib/utils'

export interface CubaTasksWidgetProps {
  data: TasksSummary | null
  loading?: boolean
  onTaskCompleted?: (taskId: string) => void
}

function formatDueDate(dueAt: string | null): { text: string; isOverdue: boolean } {
  if (!dueAt) return { text: 'Sem prazo', isOverdue: false }
  try {
    const date = new Date(dueAt)
    if (isNaN(date.getTime())) return { text: 'Sem prazo', isOverdue: false }

    const now = new Date()
    const isOverdue = date < now && date.toDateString() !== now.toDateString()
    const isToday = date.toDateString() === now.toDateString()

    const timeStr = date.toLocaleTimeString('pt-BR', {
      hour: '2-digit',
      minute: '2-digit',
    })

    if (isToday) {
      return { text: `Hoje, ${timeStr}`, isOverdue: false }
    }

    const dateStr = date.toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
    })

    return { text: `${dateStr} às ${timeStr}`, isOverdue }
  } catch {
    return { text: 'Sem prazo', isOverdue: false }
  }
}

export function CubaTasksWidget({
  data,
  loading = false,
  onTaskCompleted,
}: CubaTasksWidgetProps) {
  const [completedIds, setCompletedIds] = useState<Set<string>>(new Set())

  const handleToggleTask = (taskId: string) => {
    setCompletedIds((prev) => {
      const next = new Set(prev)
      if (next.has(taskId)) {
        next.delete(taskId)
      } else {
        next.add(taskId)
      }
      return next
    })
    onTaskCompleted?.(taskId)
  }

  const urgentTasks = data?.urgentTasks || []

  return (
    <div className="cuba-card p-5 flex flex-col justify-between h-full space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 pb-1 border-b border-border/40">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-2xl bg-primary/10 flex items-center justify-center shrink-0 text-primary">
            <CheckSquare className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-foreground">Tarefas & Ações</h3>
            <p className="text-xs text-muted-foreground">Resumo operacional do dia</p>
          </div>
        </div>

        <Link
          href="/tasks"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold text-primary bg-primary/10 hover:bg-primary/20 transition-all border border-primary/20"
        >
          <span>Ver todas</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      </div>

      {/* Loading Skeletons vs Main Content */}
      {loading ? (
        <div className="space-y-4 flex-1">
          {/* Badges Skeleton */}
          <div className="grid grid-cols-3 gap-2.5">
            <Skeleton className="h-16 rounded-2xl" />
            <Skeleton className="h-16 rounded-2xl" />
            <Skeleton className="h-16 rounded-2xl" />
          </div>

          {/* List Items Skeleton */}
          <div className="space-y-2.5 pt-1">
            {Array.from({ length: 3 }).map((_, i) => (
              <div
                key={i}
                className="flex items-center justify-between p-3 rounded-2xl border border-border/40 bg-muted/20"
              >
                <div className="flex items-center gap-3 flex-1">
                  <Skeleton className="h-4 w-4 rounded" />
                  <div className="space-y-1.5 flex-1">
                    <Skeleton className="h-4 w-3/4" />
                    <Skeleton className="h-3 w-1/2" />
                  </div>
                </div>
                <Skeleton className="h-3 w-16" />
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="space-y-4 flex-1 flex flex-col">
          {/* 3 Status Badges: Atrasadas (Red), Pendentes (Amber), Hoje (Emerald) */}
          <div className="grid grid-cols-3 gap-2.5">
            {/* Atrasadas (Red) */}
            <div className="flex flex-col justify-between p-3 rounded-2xl bg-rose-500/10 dark:bg-rose-500/15 border border-rose-500/20 text-rose-700 dark:text-rose-400">
              <span className="text-[11px] font-semibold tracking-tight text-rose-600/90 dark:text-rose-400/90">
                Atrasadas
              </span>
              <span className="text-xl font-extrabold tracking-tight mt-1">
                {data?.overdueCount ?? 0}
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

            {/* Hoje (Emerald) */}
            <div className="flex flex-col justify-between p-3 rounded-2xl bg-emerald-500/10 dark:bg-emerald-500/15 border border-emerald-500/20 text-emerald-700 dark:text-emerald-400">
              <span className="text-[11px] font-semibold tracking-tight text-emerald-600/90 dark:text-emerald-400/90">
                Hoje
              </span>
              <span className="text-xl font-extrabold tracking-tight mt-1">
                {data?.completedTodayCount ?? 0}
              </span>
            </div>
          </div>

          {/* List of Urgent Tasks */}
          <div className="flex-1 space-y-2">
            <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground px-1">
              Tarefas Urgentes
            </h4>

            {urgentTasks.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-6 text-center text-muted-foreground border border-dashed border-border/60 rounded-2xl bg-muted/10">
                <CheckCircle2 className="w-8 h-8 text-emerald-500 mb-2 opacity-80" />
                <p className="text-xs font-semibold text-foreground">Tudo em dia!</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  Nenhuma tarefa urgente pendente.
                </p>
              </div>
            ) : (
              <div className="space-y-2 max-h-[240px] overflow-y-auto no-scrollbar pr-0.5">
                {urgentTasks.map((task) => {
                  const isChecked = completedIds.has(task.id) || task.status === 'completed'
                  const { text: dueText, isOverdue } = formatDueDate(task.dueAt)

                  return (
                    <div
                      key={task.id}
                      className={cn(
                        'group flex items-start justify-between gap-3 p-3 rounded-2xl border transition-all',
                        isChecked
                          ? 'bg-muted/30 border-border/40 opacity-60'
                          : 'bg-card hover:bg-muted/40 border-border/60 shadow-2xs hover:shadow-xs'
                      )}
                    >
                      <div className="flex items-start gap-3 flex-1 min-w-0">
                        <Checkbox
                          id={`task-${task.id}`}
                          checked={isChecked}
                          onCheckedChange={() => handleToggleTask(task.id)}
                          className="mt-0.5"
                        />
                        <div className="flex-1 min-w-0 space-y-1">
                          <label
                            htmlFor={`task-${task.id}`}
                            className={cn(
                              'text-xs font-semibold leading-snug text-foreground block cursor-pointer transition-colors group-hover:text-primary',
                              isChecked && 'line-through text-muted-foreground'
                            )}
                          >
                            {task.title}
                          </label>

                          {task.contactName && (
                            <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
                              <User className="w-3 h-3 text-muted-foreground/70 shrink-0" />
                              <span className="truncate">{task.contactName}</span>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Due Date */}
                      <div className="shrink-0 text-right">
                        <span
                          className={cn(
                            'inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full',
                            isChecked
                              ? 'bg-muted text-muted-foreground'
                              : isOverdue
                              ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20'
                              : 'bg-muted/80 text-muted-foreground border border-border/40'
                          )}
                        >
                          <Clock className="w-3 h-3" />
                          <span>{dueText}</span>
                        </span>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
