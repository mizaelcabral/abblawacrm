'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Plus, Trash2, Calendar, Clock, Lock, CheckCircle2 } from 'lucide-react'
import { toast } from 'sonner'

const DAYS_OF_WEEK = [
  { id: 1, label: 'Segunda-feira' },
  { id: 2, label: 'Terça-feira' },
  { id: 3, label: 'Quarta-feira' },
  { id: 4, label: 'Quinta-feira' },
  { id: 5, label: 'Sexta-feira' },
  { id: 6, label: 'Sábado' },
  { id: 0, label: 'Domingo' }
]

interface TimeSlot {
  start_time: string
  end_time: string
}

interface DayAvailability {
  day_of_week: number
  enabled: boolean
  slots: TimeSlot[]
}

interface ExceptionItem {
  id: string
  exception_date: string
  reason: string | null
  is_blocked: boolean
}

export function AvailabilityGridEditor() {
  const [activeTab, setActiveTab] = useState<'weekly' | 'exceptions'>('weekly')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)

  // Weekly availability state
  const [availability, setAvailability] = useState<DayAvailability[]>(
    DAYS_OF_WEEK.map(d => ({
      day_of_week: d.id,
      enabled: d.id >= 1 && d.id <= 5, // Mon-Fri enabled by default
      slots: [{ start_time: '08:00', end_time: '18:00' }]
    }))
  )

  // Exceptions state
  const [exceptions, setExceptions] = useState<ExceptionItem[]>([])
  const [newDate, setNewDate] = useState('')
  const [newReason, setNewReason] = useState('')

  useEffect(() => {
    fetchAvailability()
    fetchExceptions()
  }, [])

  const fetchAvailability = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/appointments/availability?profile_id=current')
      // Note: we fetch logged in profile availability or list from API
      // Fallback if not set
    } catch (err) {
      console.error('Failed to load availability:', err)
    } finally {
      setLoading(false)
    }
  }

  const fetchExceptions = async () => {
    try {
      const res = await fetch('/api/appointments/exceptions')
      if (res.ok) {
        const data = await res.json()
        setExceptions(data.exceptions || [])
      }
    } catch (err) {
      console.error('Failed to load exceptions:', err)
    }
  }

  const handleToggleDay = (dayId: number) => {
    setAvailability(prev =>
      prev.map(d => (d.day_of_week === dayId ? { ...d, enabled: !d.enabled } : d))
    )
  }

  const handleAddSlot = (dayId: number) => {
    setAvailability(prev =>
      prev.map(d => {
        if (d.day_of_week === dayId) {
          return {
            ...d,
            slots: [...d.slots, { start_time: '14:00', end_time: '18:00' }]
          }
        }
        return d
      })
    )
  }

  const handleRemoveSlot = (dayId: number, slotIndex: number) => {
    setAvailability(prev =>
      prev.map(d => {
        if (d.day_of_week === dayId) {
          const newSlots = d.slots.filter((_, idx) => idx !== slotIndex)
          return { ...d, slots: newSlots.length > 0 ? newSlots : [{ start_time: '08:00', end_time: '18:00' }] }
        }
        return d
      })
    )
  }

  const handleSlotTimeChange = (dayId: number, slotIndex: number, field: 'start_time' | 'end_time', value: string) => {
    setAvailability(prev =>
      prev.map(d => {
        if (d.day_of_week === dayId) {
          const newSlots = [...d.slots]
          newSlots[slotIndex] = { ...newSlots[slotIndex], [field]: value }
          return { ...d, slots: newSlots }
        }
        return d
      })
    )
  }

  const handleSaveWeekly = async () => {
    setSaving(true)
    try {
      const payload: { day_of_week: number; start_time: string; end_time: string }[] = []

      availability.forEach(day => {
        if (day.enabled) {
          day.slots.forEach(slot => {
            payload.push({
              day_of_week: day.day_of_week,
              start_time: slot.start_time.length === 5 ? `${slot.start_time}:00` : slot.start_time,
              end_time: slot.end_time.length === 5 ? `${slot.end_time}:00` : slot.end_time
            })
          })
        }
      })

      const res = await fetch('/api/appointments/availability', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ availability: payload })
      })

      if (res.ok) {
        toast.success('Grade de disponibilidade semanal salva com sucesso!')
      } else {
        const data = await res.json()
        toast.error(data.error || 'Erro ao salvar disponibilidade')
      }
    } catch (err) {
      toast.error('Erro de conexão ao salvar horários')
    } finally {
      setSaving(false)
    }
  }

  const handleAddException = async () => {
    if (!newDate) {
      toast.error('Selecione a data para bloqueio')
      return
    }

    try {
      const res = await fetch('/api/appointments/exceptions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          exception_date: newDate,
          reason: newReason || 'Folga / Feriado',
          is_blocked: true
        })
      })

      if (res.ok) {
        toast.success('Exceção de data adicionada!')
        setNewDate('')
        setNewReason('')
        fetchExceptions()
      } else {
        toast.error('Erro ao adicionar exceção de data')
      }
    } catch (err) {
      toast.error('Erro de conexão ao salvar exceção')
    }
  }

  const handleDeleteException = async (id: string) => {
    try {
      const res = await fetch(`/api/appointments/exceptions?id=${id}`, {
        method: 'DELETE'
      })

      if (res.ok) {
        toast.success('Exceção removida!')
        setExceptions(prev => prev.filter(e => e.id !== id))
      } else {
        toast.error('Erro ao remover exceção')
      }
    } catch (err) {
      toast.error('Erro ao remover exceção')
    }
  }

  return (
    <Card className="border shadow-sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Clock className="h-5 w-5 text-primary" /> Painel Visual de Disponibilidade & Atendimento
        </CardTitle>
        <CardDescription>
          Gerencie os dias da semana em que você aceita consultas, defina múltiplos turnos e bloqueie folgas e feriados.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs value={activeTab} onValueChange={v => setActiveTab(v as any)} className="w-full">
          <TabsList className="grid grid-cols-2 mb-6 max-w-md">
            <TabsTrigger value="weekly" className="flex items-center gap-2">
              <Clock className="h-4 w-4" /> Horários da Semana
            </TabsTrigger>
            <TabsTrigger value="exceptions" className="flex items-center gap-2">
              <Calendar className="h-4 w-4" /> Férias & Feriados
            </TabsTrigger>
          </TabsList>

          <TabsContent value="weekly" className="space-y-4">
            {DAYS_OF_WEEK.map(d => {
              const dayData = availability.find(item => item.day_of_week === d.id) || {
                day_of_week: d.id,
                enabled: false,
                slots: []
              }

              return (
                <div
                  key={d.id}
                  className={`p-4 rounded-xl border transition-all ${
                    dayData.enabled ? 'bg-card border-border' : 'bg-muted/30 border-dashed opacity-75'
                  }`}
                >
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="flex items-center gap-3 w-48">
                      <Switch
                        checked={dayData.enabled}
                        onCheckedChange={() => handleToggleDay(d.id)}
                        id={`switch-day-${d.id}`}
                      />
                      <Label htmlFor={`switch-day-${d.id}`} className="font-semibold text-sm cursor-pointer">
                        {d.label}
                      </Label>
                    </div>

                    {dayData.enabled ? (
                      <div className="flex-1 space-y-2">
                        {dayData.slots.map((slot, sIdx) => (
                          <div key={sIdx} className="flex items-center gap-2">
                            <Input
                              type="time"
                              value={slot.start_time}
                              onChange={e => handleSlotTimeChange(d.id, sIdx, 'start_time', e.target.value)}
                              className="w-32 text-center text-sm"
                            />
                            <span className="text-muted-foreground text-xs font-bold">até</span>
                            <Input
                              type="time"
                              value={slot.end_time}
                              onChange={e => handleSlotTimeChange(d.id, sIdx, 'end_time', e.target.value)}
                              className="w-32 text-center text-sm"
                            />
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              onClick={() => handleRemoveSlot(d.id, sIdx)}
                              className="h-8 w-8 text-destructive hover:bg-destructive/10"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="flex-1 text-sm text-muted-foreground italic">Dia desabilitado (Indisponível)</div>
                    )}

                    {dayData.enabled && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => handleAddSlot(d.id)}
                        className="flex items-center gap-1 text-xs"
                      >
                        <Plus className="h-3.5 w-3.5" /> Adicionar Turno
                      </Button>
                    )}
                  </div>
                </div>
              )
            })}

            <div className="pt-4 flex justify-end">
              <Button onClick={handleSaveWeekly} disabled={saving} className="flex items-center gap-2 font-medium">
                <CheckCircle2 className="h-4 w-4" /> {saving ? 'Salvando...' : 'Salvar Alterações de Disponibilidade'}
              </Button>
            </div>
          </TabsContent>

          <TabsContent value="exceptions" className="space-y-6">
            <div className="p-4 border rounded-xl bg-card space-y-4">
              <h4 className="font-semibold text-sm flex items-center gap-2">
                <Lock className="h-4 w-4 text-amber-500" /> Adicionar Data de Bloqueio (Férias, Feriado ou Folga)
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
                <div>
                  <Label className="text-xs">Data</Label>
                  <Input type="date" value={newDate} onChange={e => setNewDate(e.target.value)} className="mt-1" />
                </div>
                <div>
                  <Label className="text-xs">Motivo (opcional)</Label>
                  <Input
                    placeholder="Ex: Feriado Nacional, Congresso Médico"
                    value={newReason}
                    onChange={e => setNewReason(e.target.value)}
                    className="mt-1"
                  />
                </div>
                <Button onClick={handleAddException} className="flex items-center gap-2">
                  <Plus className="h-4 w-4" /> Bloquear Data
                </Button>
              </div>
            </div>

            <div className="space-y-3">
              <h4 className="font-semibold text-sm text-foreground">Datas de Exceção Bloqueadas</h4>
              {exceptions.length === 0 ? (
                <p className="text-sm text-muted-foreground italic">Nenhuma data de bloqueio cadastrada.</p>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {exceptions.map(exc => (
                    <div key={exc.id} className="p-3 border rounded-lg bg-card flex items-center justify-between">
                      <div>
                        <div className="font-medium text-sm text-destructive">{exc.exception_date}</div>
                        <div className="text-xs text-muted-foreground">{exc.reason || 'Bloqueado'}</div>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDeleteException(exc.id)}
                        className="text-destructive hover:bg-destructive/10"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  )
}
