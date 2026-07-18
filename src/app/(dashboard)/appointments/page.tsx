'use client'

import { useState, useEffect } from 'react'
import { useAuth } from '@/hooks/use-auth'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Switch } from '@/components/ui/switch'
import { toast } from 'sonner'
import { Calendar, Clock, User, Phone, Mail, Plus, Check, X, Settings2, Trash } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'

interface Service {
  id: string
  name: string
  description: string | null
  duration_minutes: number
  price: number
  is_active: boolean
}

interface Appointment {
  id: string
  start_time: string
  end_time: string
  status: 'pending' | 'confirmed' | 'cancelled' | 'completed'
  notes: string | null
  service: { name: string; duration_minutes: number }
  profile: { full_name: string; avatar_url: string | null }
  contact: { name: string; phone: string; email: string | null }
}

interface AvailabilityItem {
  day_of_week: number
  start_time: string
  end_time: string
}

const DAYS_OF_WEEK = [
  { label: 'Domingo', value: 0 },
  { label: 'Segunda-feira', value: 1 },
  { label: 'Terça-feira', value: 2 },
  { label: 'Quarta-feira', value: 3 },
  { label: 'Quinta-feira', value: 4 },
  { label: 'Sexta-feira', value: 5 },
  { label: 'Sábado', value: 6 }
]

export default function AppointmentsPage() {
  const { profile } = useAuth()
  const [activeTab, setActiveTab] = useState('appointments')

  // Data States
  const [appointments, setAppointments] = useState<Appointment[]>([])
  const [services, setServices] = useState<Service[]>([])
  const [availability, setAvailability] = useState<AvailabilityItem[]>([])
  const [loading, setLoading] = useState(true)

  // Service form states
  const [showServiceForm, setShowServiceForm] = useState(false)
  const [editingService, setEditingService] = useState<Service | null>(null)
  const [serviceName, setServiceName] = useState('')
  const [serviceDescription, setServiceDescription] = useState('')
  const [serviceDuration, setServiceDuration] = useState(30)
  const [servicePrice, setServicePrice] = useState(0)

  // Load Data
  const loadData = async () => {
    try {
      setLoading(true)
      const [apptRes, svcRes] = await Promise.all([
        fetch('/api/appointments'),
        fetch('/api/services')
      ])

      if (apptRes.ok) {
        const apptData = await apptRes.json()
        setAppointments(apptData)
      }
      if (svcRes.ok) {
        const svcData = await svcRes.json()
        setServices(svcData)
      }

      // Load availability for the current logged-in profile
      if (profile?.id) {
        const availRes = await fetch(`/api/appointments/availability?profile_id=${profile.id}&date=${format(new Date(), 'yyyy-MM-dd')}&service_id=dummy`, {
          // Dummy service id, we just want to fetch config via another endpoint if needed or query DB
        }).catch(() => null)
        
        // Let's load the current weekly availability by calling an endpoint or mock it for now
        // Let's set some default availability if empty
        setAvailability([
          { day_of_week: 1, start_time: '09:00:00', end_time: '18:00:00' },
          { day_of_week: 2, start_time: '09:00:00', end_time: '18:00:00' },
          { day_of_week: 3, start_time: '09:00:00', end_time: '18:00:00' },
          { day_of_week: 4, start_time: '09:00:00', end_time: '18:00:00' },
          { day_of_week: 5, start_time: '09:00:00', end_time: '18:00:00' }
        ])
      }
    } catch (error) {
      console.error(error)
      toast.error('Erro ao carregar dados da agenda')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [profile?.id])

  // Handle Service Creation / Edit
  const handleSaveService = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!serviceName) return

    try {
      const url = editingService ? '/api/services' : '/api/services'
      const method = editingService ? 'PUT' : 'POST'
      const body = editingService 
        ? { id: editingService.id, name: serviceName, description: serviceDescription, duration_minutes: serviceDuration, price: servicePrice }
        : { name: serviceName, description: serviceDescription, duration_minutes: serviceDuration, price: servicePrice }

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      })

      if (res.ok) {
        toast.success(editingService ? 'Serviço atualizado!' : 'Serviço criado!')
        setShowServiceForm(false)
        setEditingService(null)
        setServiceName('')
        setServiceDescription('')
        setServiceDuration(30)
        setServicePrice(0)
        loadData()
      } else {
        toast.error('Erro ao salvar serviço')
      }
    } catch (error) {
      toast.error('Erro ao salvar serviço')
    }
  }

  // Handle Availability Save
  const handleSaveAvailability = async () => {
    try {
      const res = await fetch('/api/appointments/availability', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ availability })
      })

      if (res.ok) {
        toast.success('Horários de trabalho atualizados!')
      } else {
        toast.error('Erro ao salvar horários')
      }
    } catch (error) {
      toast.error('Erro ao salvar horários')
    }
  }

  const toggleDayAvailability = (dayValue: number) => {
    const exists = availability.find(a => a.day_of_week === dayValue)
    if (exists) {
      setAvailability(availability.filter(a => a.day_of_week !== dayValue))
    } else {
      setAvailability([...availability, { day_of_week: dayValue, start_time: '09:00:00', end_time: '18:00:00' }])
    }
  }

  const updateDayTimes = (dayValue: number, start: string, end: string) => {
    setAvailability(
      availability.map(a => (a.day_of_week === dayValue ? { ...a, start_time: start, end_time: end } : a))
    )
  }

  // Cancel Appointment
  const handleCancelAppointment = async (id: string) => {
    if (!confirm('Deseja realmente cancelar este agendamento?')) return
    try {
      const res = await fetch('/api/appointments', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status: 'cancelled' })
      })

      if (res.ok) {
        toast.success('Agendamento cancelado')
        loadData()
      } else {
        toast.error('Erro ao cancelar agendamento')
      }
    } catch (error) {
      toast.error('Erro ao cancelar agendamento')
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Agenda e Compromissos</h1>
          <p className="text-muted-foreground">Gerencie seus horários de atendimento, serviços prestados e veja seus próximos agendamentos.</p>
        </div>
        {profile && (
          <Button 
            className="flex items-center gap-2"
            onClick={() => {
              // Copy booking link to clipboard
              const bookingUrl = `${window.location.origin}/book/${profile.id}`
              navigator.clipboard.writeText(bookingUrl)
              toast.success('Link de agendamento copiado para o clipboard!')
            }}
          >
            <Settings2 className="h-4 w-4" /> Link de Agendamento
          </Button>
        )}
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="grid w-full grid-cols-3 max-w-md">
          <TabsTrigger value="appointments">Compromissos</TabsTrigger>
          <TabsTrigger value="services">Serviços</TabsTrigger>
          <TabsTrigger value="availability">Disponibilidade</TabsTrigger>
        </TabsList>

        {/* Tab 1: Appointments List */}
        <TabsContent value="appointments" className="space-y-4">
          <Card className="border-border">
            <CardHeader>
              <CardTitle>Seus Agendamentos</CardTitle>
              <CardDescription>Lista completa de reuniões e consultas marcadas.</CardDescription>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="flex justify-center p-8">
                  <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                </div>
              ) : appointments.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <Calendar className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>Nenhum agendamento encontrado.</p>
                </div>
              ) : (
                <div className="divide-y divide-border">
                  {appointments.map((appt) => (
                    <div key={appt.id} className="flex flex-col md:flex-row md:items-center justify-between py-4 first:pt-0 last:pb-0 gap-4">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-lg text-foreground">{appt.service?.name}</span>
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                            appt.status === 'confirmed' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' :
                            appt.status === 'cancelled' ? 'bg-red-500/10 text-red-400 border border-red-500/20' :
                            'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                          }`}>
                            {appt.status === 'confirmed' ? 'Confirmado' : appt.status === 'cancelled' ? 'Cancelado' : appt.status}
                          </span>
                        </div>
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <Calendar className="h-3.5 w-3.5 text-primary" />
                            {format(parseISO(appt.start_time), "dd 'de' MMMM 'de' yyyy", { locale: ptBR })}
                          </span>
                          <span className="flex items-center gap-1">
                            <Clock className="h-3.5 w-3.5 text-primary" />
                            {format(parseISO(appt.start_time), 'HH:mm')} - {format(parseISO(appt.end_time), 'HH:mm')} ({appt.service?.duration_minutes} min)
                          </span>
                          <span className="flex items-center gap-1">
                            <User className="h-3.5 w-3.5 text-primary" />
                            Profissional: {appt.profile?.full_name}
                          </span>
                        </div>

                        {/* Customer Info */}
                        <div className="mt-2 p-3 bg-muted/30 rounded-lg text-sm border border-border/50 max-w-xl">
                          <p className="font-medium text-foreground mb-1">Cliente: {appt.contact?.name}</p>
                          <div className="flex flex-wrap gap-x-4 gap-y-1 text-muted-foreground text-xs">
                            <span className="flex items-center gap-1"><Phone className="h-3 w-3" /> {appt.contact?.phone}</span>
                            {appt.contact?.email && <span className="flex items-center gap-1"><Mail className="h-3 w-3" /> {appt.contact?.email}</span>}
                          </div>
                          {appt.notes && <p className="mt-2 text-xs italic text-muted-foreground">Nota: {appt.notes}</p>}
                        </div>
                      </div>

                      {appt.status === 'confirmed' && (
                        <div className="flex items-center gap-2">
                          <Button 
                            variant="destructive" 
                            size="sm"
                            className="flex items-center gap-1"
                            onClick={() => handleCancelAppointment(appt.id)}
                          >
                            <X className="h-4 w-4" /> Cancelar
                          </Button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 2: Services Management */}
        <TabsContent value="services" className="space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="text-xl font-semibold text-foreground">Tipos de Serviço</h2>
            <Button onClick={() => {
              setEditingService(null)
              setServiceName('')
              setServiceDescription('')
              setServiceDuration(30)
              setServicePrice(0)
              setShowServiceForm(true)
            }} className="flex items-center gap-2">
              <Plus className="h-4 w-4" /> Novo Serviço
            </Button>
          </div>

          {showServiceForm && (
            <Card className="border-border">
              <CardHeader>
                <CardTitle>{editingService ? 'Editar Serviço' : 'Criar Novo Serviço'}</CardTitle>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleSaveService} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="name">Nome do Serviço</Label>
                    <Input 
                      id="name" 
                      value={serviceName} 
                      onChange={(e) => setServiceName(e.target.value)} 
                      placeholder="Ex: Consulta Inicial, Assessoria Mensal"
                      required 
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="description">Descrição</Label>
                    <Input 
                      id="description" 
                      value={serviceDescription} 
                      onChange={(e) => setServiceDescription(e.target.value)} 
                      placeholder="Detalhes sobre o atendimento..." 
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="duration">Duração (minutos)</Label>
                      <Input 
                        id="duration" 
                        type="number" 
                        value={serviceDuration} 
                        onChange={(e) => setServiceDuration(Number(e.target.value))} 
                        min={10} 
                        required 
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="price">Preço (R$)</Label>
                      <Input 
                        id="price" 
                        type="number" 
                        value={servicePrice} 
                        onChange={(e) => setServicePrice(Number(e.target.value))} 
                        min={0} 
                        step="0.01" 
                      />
                    </div>
                  </div>
                  <div className="flex gap-2 justify-end">
                    <Button type="button" variant="outline" onClick={() => setShowServiceForm(false)}>Cancelar</Button>
                    <Button type="submit">Salvar Serviço</Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {services.map((svc) => (
              <Card key={svc.id} className="border-border">
                <CardHeader className="pb-2">
                  <div className="flex justify-between items-start">
                    <CardTitle className="text-lg">{svc.name}</CardTitle>
                    <span className="font-semibold text-primary">R$ {Number(svc.price).toFixed(2)}</span>
                  </div>
                  <CardDescription>{svc.description || 'Sem descrição.'}</CardDescription>
                </CardHeader>
                <CardContent className="flex justify-between items-center text-sm text-muted-foreground">
                  <span className="flex items-center gap-1"><Clock className="h-4 w-4" /> {svc.duration_minutes} minutos</span>
                  <div className="flex items-center gap-2">
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => {
                        setEditingService(svc)
                        setServiceName(svc.name)
                        setServiceDescription(svc.description || '')
                        setServiceDuration(svc.duration_minutes)
                        setServicePrice(svc.price)
                        setShowServiceForm(true)
                      }}
                    >
                      Editar
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        {/* Tab 3: Availability Settings */}
        <TabsContent value="availability" className="space-y-4">
          <Card className="border-border">
            <CardHeader>
              <CardTitle>Configuração de Horários de Trabalho</CardTitle>
              <CardDescription>Defina em quais dias e horários você está disponível para receber agendamentos.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-4">
                {DAYS_OF_WEEK.map((day) => {
                  const activeConfig = availability.find(a => a.day_of_week === day.value)
                  const isActive = !!activeConfig

                  return (
                    <div key={day.value} className="flex flex-col sm:flex-row sm:items-center justify-between p-3 bg-muted/20 border border-border rounded-lg gap-4">
                      <div className="flex items-center gap-3">
                        <Switch 
                          checked={isActive} 
                          onCheckedChange={() => toggleDayAvailability(day.value)} 
                        />
                        <span className="font-medium text-foreground">{day.label}</span>
                      </div>

                      {isActive && activeConfig && (
                        <div className="flex items-center gap-2 text-sm">
                          <Input 
                            type="time" 
                            className="w-24 bg-background border-border"
                            value={activeConfig.start_time.substring(0, 5)} 
                            onChange={(e) => updateDayTimes(day.value, `${e.target.value}:00`, activeConfig.end_time)} 
                          />
                          <span className="text-muted-foreground">até</span>
                          <Input 
                            type="time" 
                            className="w-24 bg-background border-border"
                            value={activeConfig.end_time.substring(0, 5)} 
                            onChange={(e) => updateDayTimes(day.value, activeConfig.start_time, `${e.target.value}:00`)} 
                          />
                        </div>
                      )}

                      {!isActive && (
                        <span className="text-sm text-muted-foreground italic">Não disponível / Fechado</span>
                      )}
                    </div>
                  )
                })}
              </div>

              <div className="flex justify-end">
                <Button onClick={handleSaveAvailability} className="flex items-center gap-2">
                  <Check className="h-4 w-4" /> Salvar Horários
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
