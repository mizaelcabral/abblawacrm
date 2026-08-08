'use client'

import { useState, useEffect, useRef } from 'react'
import { useAuth } from '@/hooks/use-auth'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Switch } from '@/components/ui/switch'
import { toast } from 'sonner'
import { Calendar, Clock, User, Phone, Mail, Plus, Check, X, Settings2, Trash, Upload, Loader2, Code } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'

import { AvailabilityGridEditor } from '@/components/appointments/AvailabilityGridEditor'
import { EmbeddedWidgetModal } from '@/components/appointments/EmbeddedWidgetModal'
import { uploadAccountMedia } from '@/lib/storage/upload-media'
import { getCleanSlug } from '@/lib/utils'

interface ServiceExtended {
  id: string
  name: string
  description: string | null
  duration_minutes: number
  price: number
  is_active: boolean
  payment_required?: boolean
  location_type?: 'online' | 'presencial' | 'ambos'
  online_meeting_url?: string | null
  physical_address?: string | null
  buffer_minutes?: number
  provider_name?: string | null
  provider_avatar_url?: string | null
  show_provider_avatar?: boolean
  clinic_name?: string | null
  clinic_logo_url?: string | null
  show_clinic_logo?: boolean
  custom_questions?: any[]
}

interface Appointment {
  id: string
  start_time: string
  end_time: string
  status: 'pending' | 'confirmed' | 'cancelled' | 'completed'
  notes: string | null
  contact_id: string
  service: { name: string; duration_minutes: number }
  profile: { full_name: string; avatar_url: string | null }
  contact: { name: string; phone: string; email: string | null }
}

interface ImageUploadInputProps {
  value: string
  onChange: (url: string) => void
  placeholder?: string
  label?: string
}

function ImageUploadInput({ value, onChange, placeholder = 'Carregar imagem', label }: ImageUploadInputProps) {
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const validTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp']
    if (!validTypes.includes(file.type)) {
      toast.error('Por favor, selecione uma imagem no formato PNG, JPG, JPEG ou WEBP.')
      return
    }

    try {
      setUploading(true)
      const res = await uploadAccountMedia('chat-media', file)
      onChange(res.publicUrl)
      toast.success('Imagem enviada com sucesso!')
    } catch (err: any) {
      console.error(err)
      toast.error(err?.message || 'Erro ao fazer upload da imagem')
    } finally {
      setUploading(false)
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    }
  }

  return (
    <div className="space-y-2">
      {label && <Label className="text-xs">{label}</Label>}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        accept="image/png, image/jpeg, image/jpg, image/webp"
        className="hidden"
      />

      {value ? (
        <div className="flex items-center gap-3 p-2 border rounded-md bg-background">
          <div className="relative h-10 w-10 rounded overflow-hidden border bg-muted flex items-center justify-center shrink-0">
            <img src={value} alt="Preview" className="h-full w-full object-cover" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[11px] text-muted-foreground truncate">{value}</p>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 px-2 text-[11px]"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
            >
              Trocar
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0 text-destructive hover:bg-destructive/10"
              onClick={() => onChange('')}
              disabled={uploading}
            >
              <Trash className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      ) : (
        <Button
          type="button"
          variant="outline"
          className="w-full flex items-center justify-center gap-2 h-9 border-dashed text-xs text-muted-foreground hover:text-foreground"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
        >
          {uploading ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
              <span>Enviando...</span>
            </>
          ) : (
            <>
              <Upload className="h-3.5 w-3.5" />
              <span>{placeholder} (.png, .jpg, .jpeg, .webp)</span>
            </>
          )}
        </Button>
      )}
    </div>
  )
}

export default function AppointmentsPage() {
  const { profile } = useAuth()
  const cleanSlug = getCleanSlug(profile)
  const [activeTab, setActiveTab] = useState('appointments')

  // Data States
  const [appointments, setAppointments] = useState<Appointment[]>([])
  const [loading, setLoading] = useState(true)

  // Service form states
  const [showServiceForm, setShowServiceForm] = useState(false)
  const [editingService, setEditingService] = useState<ServiceExtended | null>(null)
  const [serviceName, setServiceName] = useState('')
  const [serviceDescription, setServiceDescription] = useState('')
  const [serviceDuration, setServiceDuration] = useState(30)
  const [servicePrice, setServicePrice] = useState(0)
  const [servicePaymentRequired, setServicePaymentRequired] = useState(false)

  // Extended Service form states
  const [showWidgetModal, setShowWidgetModal] = useState(false)
  const [services, setServices] = useState<ServiceExtended[]>([])
  const [locationType, setLocationType] = useState<'online' | 'presencial' | 'ambos'>('online')
  const [onlineMeetingUrl, setOnlineMeetingUrl] = useState('')
  const [physicalAddress, setPhysicalAddress] = useState('')
  const [bufferMinutes, setBufferMinutes] = useState(0)
  const [providerName, setProviderName] = useState('')
  const [providerAvatarUrl, setProviderAvatarUrl] = useState('')
  const [showProviderAvatar, setShowProviderAvatar] = useState(false)
  const [clinicName, setClinicName] = useState('')
  const [clinicLogoUrl, setClinicLogoUrl] = useState('')
  const [showClinicLogo, setShowClinicLogo] = useState(false)

  // Task form states
  const [showTaskForm, setShowTaskForm] = useState(false)
  const [taskAppt, setTaskAppt] = useState<Appointment | null>(null)
  const [taskTitle, setTaskTitle] = useState('')
  const [taskDueDate, setTaskDueDate] = useState('')

  const handleEditService = (svc: ServiceExtended) => {
    setEditingService(svc)
    setServiceName(svc.name)
    setServiceDescription(svc.description || '')
    setServiceDuration(svc.duration_minutes)
    setServicePrice(svc.price)
    setServicePaymentRequired(svc.payment_required || false)
    setLocationType(svc.location_type || 'online')
    setOnlineMeetingUrl(svc.online_meeting_url || '')
    setPhysicalAddress(svc.physical_address || '')
    setBufferMinutes(svc.buffer_minutes || 0)
    setProviderName(svc.provider_name || '')
    setProviderAvatarUrl(svc.provider_avatar_url || '')
    setShowProviderAvatar(svc.show_provider_avatar || false)
    setClinicName(svc.clinic_name || '')
    setClinicLogoUrl(svc.clinic_logo_url || '')
    setShowClinicLogo(svc.show_clinic_logo || false)
    setShowServiceForm(true)
  }

  const handleNewService = () => {
    setEditingService(null)
    setServiceName('')
    setServiceDescription('')
    setServiceDuration(30)
    setServicePrice(0)
    setServicePaymentRequired(false)
    setLocationType('online')
    setOnlineMeetingUrl('')
    setPhysicalAddress('')
    setBufferMinutes(0)
    setProviderName('')
    setProviderAvatarUrl('')
    setShowProviderAvatar(false)
    setClinicName('')
    setClinicLogoUrl('')
    setShowClinicLogo(false)
    setShowServiceForm(true)
  }

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
      const url = '/api/services'
      const method = editingService ? 'PUT' : 'POST'
      const payloadData = {
        name: serviceName,
        description: serviceDescription,
        duration_minutes: serviceDuration,
        price: servicePrice,
        payment_required: servicePaymentRequired,
        location_type: locationType,
        online_meeting_url: onlineMeetingUrl || null,
        physical_address: physicalAddress || null,
        buffer_minutes: bufferMinutes,
        provider_name: providerName || null,
        provider_avatar_url: providerAvatarUrl || null,
        show_provider_avatar: showProviderAvatar,
        clinic_name: clinicName || null,
        clinic_logo_url: clinicLogoUrl || null,
        show_clinic_logo: showClinicLogo
      }
      const body = editingService ? { id: editingService.id, ...payloadData } : payloadData

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      })

      if (res.ok) {
        toast.success(editingService ? 'Serviço atualizado!' : 'Serviço criado!')
        setShowServiceForm(false)
        handleNewService()
        setShowServiceForm(false)
        loadData()
      } else {
        toast.error('Erro ao salvar serviço')
      }
    } catch (error) {
      toast.error('Erro ao salvar serviço')
    }
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

  // Save Task associated with the appointment
  const handleSaveTask = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!taskTitle || !taskAppt) return

    try {
      const res = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: taskTitle,
          due_at: taskDueDate ? `${taskDueDate}T23:59:59.999Z` : null,
          contact_id: taskAppt.contact_id || null
        })
      })

      if (res.ok) {
        toast.success('Tarefa associada criada com sucesso!')
        setShowTaskForm(false)
        setTaskAppt(null)
      } else {
        toast.error('Erro ao criar tarefa')
      }
    } catch (error) {
      toast.error('Erro ao criar tarefa')
    }
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6 w-full max-w-full">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Agenda e Compromissos</h1>
          <p className="text-muted-foreground">Gerencie seus horários de atendimento, serviços prestados e veja seus próximos agendamentos.</p>
        </div>
        {profile && (
          <div className="flex items-center gap-2">
            <Button 
              variant="outline"
              className="flex items-center gap-2"
              onClick={() => setShowWidgetModal(true)}
            >
              <Code className="h-4 w-4 text-primary" /> Widget Embeddable
            </Button>
            <Button 
              className="flex items-center gap-2"
              onClick={() => {
                const bookingUrl = `${window.location.origin}/book/${cleanSlug}`
                navigator.clipboard.writeText(bookingUrl)
                toast.success('Link de agendamento copiado para o clipboard!')
              }}
            >
              <Settings2 className="h-4 w-4" /> Link de Agendamento
            </Button>
          </div>
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
                            variant="outline" 
                            size="sm"
                            className="flex items-center gap-1 border-primary/30 text-primary hover:bg-primary/10 hover:text-primary font-medium text-xs"
                            onClick={() => {
                              setTaskAppt(appt)
                              setTaskTitle(`Retornar para o cliente: ${appt.contact?.name}`)
                              setTaskDueDate(appt.start_time.split('T')[0])
                              setShowTaskForm(true)
                            }}
                          >
                            <Plus className="h-3.5 w-3.5" /> Criar Tarefa
                          </Button>
                          <Button 
                            variant="outline" 
                            size="sm"
                            className="flex items-center gap-1 border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive font-medium text-xs"
                            onClick={() => handleCancelAppointment(appt.id)}
                          >
                            <X className="h-3.5 w-3.5" /> Cancelar
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
            <Button onClick={handleNewService} className="flex items-center gap-2">
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
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
                      <Label htmlFor="buffer">Intervalo/Buffer (minutos)</Label>
                      <Input 
                        id="buffer" 
                        type="number" 
                        value={bufferMinutes} 
                        onChange={(e) => setBufferMinutes(Number(e.target.value))} 
                        min={0} 
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

                  <div className="space-y-2 pt-2">
                    <Label>Modalidade de Atendimento</Label>
                    <div className="flex items-center gap-4">
                      <label className="flex items-center gap-2 text-sm cursor-pointer">
                        <input
                          type="radio"
                          name="locationType"
                          value="online"
                          checked={locationType === 'online'}
                          onChange={() => setLocationType('online')}
                        />
                        Online (Telemedicina / Reunião)
                      </label>
                      <label className="flex items-center gap-2 text-sm cursor-pointer">
                        <input
                          type="radio"
                          name="locationType"
                          value="presencial"
                          checked={locationType === 'presencial'}
                          onChange={() => setLocationType('presencial')}
                        />
                        Presencial (Consultório)
                      </label>
                      <label className="flex items-center gap-2 text-sm cursor-pointer">
                        <input
                          type="radio"
                          name="locationType"
                          value="ambos"
                          checked={locationType === 'ambos'}
                          onChange={() => setLocationType('ambos')}
                        />
                        Ambos
                      </label>
                    </div>
                  </div>

                  {(locationType === 'online' || locationType === 'ambos') && (
                    <div className="space-y-2">
                      <Label htmlFor="online_meeting_url">Link Fixo da Sala Online (Opcional)</Label>
                      <Input
                        id="online_meeting_url"
                        value={onlineMeetingUrl}
                        onChange={(e) => setOnlineMeetingUrl(e.target.value)}
                        placeholder="Ex: https://meet.google.com/abc-defg-hij ou link do Dr. Consulta"
                      />
                      <p className="text-[11px] text-muted-foreground">Se em branco, um link seguro do Jitsi será gerado automaticamente para cada consulta.</p>
                    </div>
                  )}

                  {(locationType === 'presencial' || locationType === 'ambos') && (
                    <div className="space-y-2">
                      <Label htmlFor="physical_address">Endereço da Clínica / Consultório</Label>
                      <Input
                        id="physical_address"
                        value={physicalAddress}
                        onChange={(e) => setPhysicalAddress(e.target.value)}
                        placeholder="Ex: Av. Paulista, 1000 - Sala 42, São Paulo - SP"
                      />
                    </div>
                  )}

                  <div className="border-t pt-4 space-y-4">
                    <h4 className="font-semibold text-sm">Personalização Visual e Branding (Opcional)</h4>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-3 p-3 border rounded-lg bg-muted/20">
                        <div className="flex items-center justify-between">
                          <Label htmlFor="show_provider_avatar" className="font-medium cursor-pointer">Ativar Foto do Profissional</Label>
                          <Switch
                            id="show_provider_avatar"
                            checked={showProviderAvatar}
                            onCheckedChange={setShowProviderAvatar}
                          />
                        </div>
                        {showProviderAvatar && (
                          <div className="space-y-3">
                            <Input
                              placeholder="Nome do Profissional (Ex: Dr. João Silva)"
                              value={providerName}
                              onChange={(e) => setProviderName(e.target.value)}
                              className="text-xs"
                            />
                            <ImageUploadInput
                              value={providerAvatarUrl}
                              onChange={setProviderAvatarUrl}
                              placeholder="Upload da Foto do Profissional"
                              label="Foto do Profissional (Avatar)"
                            />
                          </div>
                        )}
                      </div>

                      <div className="space-y-3 p-3 border rounded-lg bg-muted/20">
                        <div className="flex items-center justify-between">
                          <Label htmlFor="show_clinic_logo" className="font-medium cursor-pointer">Ativar Logo da Clínica</Label>
                          <Switch
                            id="show_clinic_logo"
                            checked={showClinicLogo}
                            onCheckedChange={setShowClinicLogo}
                          />
                        </div>
                        {showClinicLogo && (
                          <div className="space-y-3">
                            <Input
                              placeholder="Nome da Clínica (Ex: Clínica Vida & Saúde)"
                              value={clinicName}
                              onChange={(e) => setClinicName(e.target.value)}
                              className="text-xs"
                            />
                            <ImageUploadInput
                              value={clinicLogoUrl}
                              onChange={setClinicLogoUrl}
                              placeholder="Upload da Logo da Clínica"
                              label="Logo da Clínica / Empresa"
                            />
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 py-2">
                    <Switch
                      id="payment_required"
                      checked={servicePaymentRequired}
                      onCheckedChange={setServicePaymentRequired}
                    />
                    <Label htmlFor="payment_required" className="cursor-pointer">Exigir pagamento via Pix (Woovi) antes de confirmar o agendamento</Label>
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
                    <div className="space-y-1">
                      <CardTitle className="text-lg">{svc.name}</CardTitle>
                      {svc.payment_required && (
                        <span className="inline-block text-[10px] font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20 px-2 py-0.5 rounded-full">
                          Pix Obrigatório
                        </span>
                      )}
                    </div>
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
                      onClick={() => handleEditService(svc)}
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
          <AvailabilityGridEditor />
        </TabsContent>
      </Tabs>

      <EmbeddedWidgetModal
        open={showWidgetModal}
        onOpenChange={setShowWidgetModal}
        bookingSlug={cleanSlug}
      />

      {/* Task Creation Dialog */}
      {showTaskForm && taskAppt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <Card className="w-full max-w-md border-border bg-card shadow-2xl">
            <CardHeader>
              <CardTitle>Criar Tarefa para o Cliente</CardTitle>
              <CardDescription>Agende um retorno ou tarefa associada a este compromisso.</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSaveTask} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="taskTitle">Título da Tarefa</Label>
                  <Input
                    id="taskTitle"
                    value={taskTitle}
                    onChange={(e) => setTaskTitle(e.target.value)}
                    placeholder="Ex: Enviar proposta pós-reunião"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="taskDueDate">Data de Vencimento</Label>
                  <Input
                    id="taskDueDate"
                    type="date"
                    value={taskDueDate}
                    onChange={(e) => setTaskDueDate(e.target.value)}
                    required
                  />
                </div>
                <div className="flex gap-2 justify-end pt-2">
                  <Button type="button" variant="outline" onClick={() => {
                    setShowTaskForm(false)
                    setTaskAppt(null)
                  }}>Cancelar</Button>
                  <Button type="submit">Criar Tarefa</Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}
