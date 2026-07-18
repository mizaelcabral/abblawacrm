'use client'

import { useState, useEffect, use } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'
import { Calendar as CalendarIcon, Clock, User, Phone, Mail, CheckCircle2, ChevronRight, FileText } from 'lucide-react'
import { format, addDays } from 'date-fns'
import { ptBR } from 'date-fns/locale'

interface Service {
  id: string
  name: string
  description: string | null
  duration_minutes: number
  price: number
}

interface Profile {
  id: string
  full_name: string
  avatar_url: string | null
  account_id: string
}

export default function PublicBookingPage({ params }: { params: Promise<{ slug: string }> }) {
  const resolvedParams = use(params)
  const profileId = resolvedParams.slug

  const [profile, setProfile] = useState<Profile | null>(null)
  const [services, setServices] = useState<Service[]>([])
  const [loading, setLoading] = useState(true)

  // Booking Flow State
  const [selectedService, setSelectedService] = useState<Service | null>(null)
  const [selectedDate, setSelectedDate] = useState<string>(format(new Date(), 'yyyy-MM-dd'))
  const [availableSlots, setAvailableSlots] = useState<string[]>([])
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null)
  const [loadingSlots, setLoadingSlots] = useState(false)

  // Form State
  const [clientName, setClientName] = useState('')
  const [clientPhone, setClientPhone] = useState('')
  const [clientEmail, setClientEmail] = useState('')
  const [clientNotes, setClientNotes] = useState('')

  const [bookingSuccess, setBookingSuccess] = useState(false)
  const [bookingData, setBookingData] = useState<any>(null)

  const supabase = createClient()

  // Load Profile and Services
  useEffect(() => {
    async function loadProfileAndServices() {
      try {
        setLoading(true)
        // Fetch Profile
        const { data: prof, error: profError } = await supabase
          .from('profiles')
          .select('id, full_name, avatar_url, account_id')
          .eq('id', profileId)
          .single()

        if (profError || !prof) {
          toast.error('Profissional não encontrado')
          setLoading(false)
          return
        }

        setProfile(prof)

        // Fetch active services under the account
        const { data: svcs, error: svcsError } = await supabase
          .from('services')
          .select('id, name, description, duration_minutes, price')
          .eq('account_id', prof.account_id)
          .eq('is_active', true)

        if (svcsError) {
          toast.error('Erro ao buscar serviços')
        } else {
          setServices(svcs ?? [])
        }
      } catch (error) {
        toast.error('Erro ao carregar a página')
      } finally {
        setLoading(false)
      }
    }

    loadProfileAndServices()
  }, [profileId])

  // Fetch Slots when Date or Service changes
  useEffect(() => {
    if (!selectedService || !selectedDate) return

    async function fetchSlots() {
      try {
        setLoadingSlots(true)
        setSelectedSlot(null)
        const res = await fetch(`/api/appointments/availability?profile_id=${profileId}&date=${selectedDate}&service_id=${selectedService?.id}`)
        if (res.ok) {
          const data = await res.json()
          setAvailableSlots(data.slots || [])
        } else {
          setAvailableSlots([])
        }
      } catch (error) {
        console.error(error)
      } finally {
        setLoadingSlots(false)
      }
    }

    fetchSlots()
  }, [selectedService, selectedDate, profileId])

  // Confirm booking
  const handleConfirmBooking = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedService || !selectedDate || !selectedSlot || !clientName || !clientPhone) {
      toast.error('Por favor, preencha todos os campos obrigatórios.')
      return
    }

    try {
      const startTime = `${selectedDate}T${selectedSlot}:00`
      const res = await fetch('/api/appointments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          service_id: selectedService.id,
          profile_id: profileId,
          start_time: startTime,
          notes: clientNotes,
          client: {
            name: clientName,
            phone: clientPhone,
            email: clientEmail || null
          }
        })
      })

      if (res.ok) {
        const data = await res.json()
        setBookingData(data)
        setBookingSuccess(true)
        toast.success('Agendamento confirmado com sucesso!')
      } else {
        const err = await res.json()
        toast.error(err.error || 'Erro ao realizar agendamento')
      }
    } catch (error) {
      toast.error('Erro de conexão ao realizar agendamento')
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#09090b] text-white">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <p className="text-sm text-zinc-400">Carregando formulário de agendamento...</p>
        </div>
      </div>
    )
  }

  if (!profile) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#09090b] text-white">
        <div className="text-center space-y-4">
          <h1 className="text-2xl font-bold text-red-500">Link Inválido</h1>
          <p className="text-zinc-400">O profissional requisitado não foi localizado no sistema.</p>
        </div>
      </div>
    )
  }

  if (bookingSuccess) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#09090b] text-white p-4">
        <Card className="w-full max-w-md border-zinc-800 bg-zinc-950/80 backdrop-blur-xl">
          <CardContent className="pt-6 text-center space-y-6">
            <div className="flex justify-center">
              <CheckCircle2 className="h-16 w-16 text-emerald-500 animate-bounce" />
            </div>
            <div className="space-y-2">
              <h2 className="text-2xl font-bold text-white">Agendamento Confirmado!</h2>
              <p className="text-zinc-400 text-sm">Tudo certo para o seu atendimento com {profile.full_name}.</p>
            </div>

            <div className="border border-zinc-800 rounded-lg p-4 bg-zinc-900/50 text-left space-y-3">
              <p className="text-sm text-zinc-400"><strong>Serviço:</strong> <span className="text-white">{bookingData?.service?.name}</span></p>
              <p className="text-sm text-zinc-400"><strong>Data:</strong> <span className="text-white">{format(parseISO(bookingData?.start_time), "dd 'de' MMMM 'de' yyyy", { locale: ptBR })}</span></p>
              <p className="text-sm text-zinc-400"><strong>Horário:</strong> <span className="text-white">{format(parseISO(bookingData?.start_time), 'HH:mm')}</span></p>
            </div>

            <p className="text-xs text-zinc-500">Um lembrete será enviado para o telefone/e-mail informado.</p>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#09090b] text-white py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto grid grid-cols-1 md:grid-cols-5 gap-8">
        
        {/* Profile Sidebar */}
        <div className="md:col-span-2 space-y-6">
          <div className="flex flex-col items-center text-center p-6 bg-zinc-950/40 border border-zinc-800 rounded-2xl">
            <div className="h-24 w-24 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center text-3xl font-bold text-white mb-4">
              {profile.full_name.charAt(0)}
            </div>
            <h2 className="text-xl font-bold text-white">{profile.full_name}</h2>
            <p className="text-zinc-400 text-sm mt-1">Agende um atendimento online ou presencial</p>
          </div>

          {/* Steps Indicator */}
          <div className="p-4 bg-zinc-950/40 border border-zinc-800 rounded-2xl space-y-3 text-sm">
            <h3 className="font-semibold text-zinc-300">Etapas do Agendamento</h3>
            <div className="space-y-2">
              <div className={`flex items-center gap-2 ${selectedService ? 'text-zinc-500' : 'text-primary font-medium'}`}>
                <span className="h-5 w-5 rounded-full border border-current flex items-center justify-center text-xs font-bold">1</span>
                <span>Selecione o Serviço</span>
              </div>
              <div className={`flex items-center gap-2 ${selectedService && !selectedSlot ? 'text-primary font-medium' : 'text-zinc-500'}`}>
                <span className="h-5 w-5 rounded-full border border-current flex items-center justify-center text-xs font-bold">2</span>
                <span>Escolha Data & Hora</span>
              </div>
              <div className={`flex items-center gap-2 ${selectedSlot ? 'text-primary font-medium' : 'text-zinc-500'}`}>
                <span className="h-5 w-5 rounded-full border border-current flex items-center justify-center text-xs font-bold">3</span>
                <span>Seus Dados</span>
              </div>
            </div>
          </div>
        </div>

        {/* Dynamic Booking Content */}
        <div className="md:col-span-3">
          <Card className="border-zinc-800 bg-zinc-950/40 backdrop-blur-xl text-white">
            <CardContent className="pt-6 space-y-6">
              
              {/* Step 1: Select Service */}
              {!selectedService && (
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold border-b border-zinc-800 pb-2">Selecione o Serviço</h3>
                  <div className="space-y-3">
                    {services.map((svc) => (
                      <div 
                        key={svc.id} 
                        onClick={() => setSelectedService(svc)}
                        className="flex justify-between items-center p-4 rounded-xl border border-zinc-800 bg-zinc-900/30 hover:bg-zinc-900/60 hover:border-zinc-700 transition cursor-pointer group"
                      >
                        <div className="space-y-1">
                          <h4 className="font-bold text-white group-hover:text-primary transition">{svc.name}</h4>
                          <p className="text-xs text-zinc-400">{svc.description || 'Atendimento personalizado.'}</p>
                          <span className="inline-flex items-center gap-1 text-xs text-zinc-500 mt-2">
                            <Clock className="h-3 w-3" /> {svc.duration_minutes} minutos
                          </span>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="font-bold text-sm text-zinc-300">R$ {Number(svc.price).toFixed(2)}</span>
                          <ChevronRight className="h-4 w-4 text-zinc-500 group-hover:text-primary transition" />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Step 2: Date & Slot Selection */}
              {selectedService && !selectedSlot && (
                <div className="space-y-6">
                  <div className="flex items-center justify-between border-b border-zinc-800 pb-2">
                    <h3 className="text-lg font-semibold">Escolha a data e hora</h3>
                    <Button variant="ghost" className="text-xs text-zinc-400 hover:text-white" onClick={() => setSelectedService(null)}>Voltar</Button>
                  </div>

                  <div className="space-y-4">
                    <Label className="text-zinc-400">Serviço Selecionado:</Label>
                    <div className="p-3 bg-zinc-900/40 border border-zinc-800 rounded-lg flex justify-between items-center">
                      <div>
                        <p className="font-bold text-sm">{selectedService.name}</p>
                        <p className="text-xs text-zinc-500">{selectedService.duration_minutes} min</p>
                      </div>
                      <span className="font-semibold text-sm">R$ {Number(selectedService.price).toFixed(2)}</span>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="date">Data do Atendimento</Label>
                      <Input 
                        id="date"
                        type="date"
                        className="bg-zinc-900 border-zinc-800 text-white"
                        min={format(new Date(), 'yyyy-MM-dd')}
                        max={format(addDays(new Date(), 30), 'yyyy-MM-dd')}
                        value={selectedDate}
                        onChange={(e) => setSelectedDate(e.target.value)}
                      />
                    </div>

                    <div className="space-y-3">
                      <Label>Horários Disponíveis</Label>
                      {loadingSlots ? (
                        <div className="flex justify-center py-6">
                          <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                        </div>
                      ) : availableSlots.length === 0 ? (
                        <p className="text-sm text-zinc-500 italic py-4 text-center">Nenhum horário disponível para este dia.</p>
                      ) : (
                        <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                          {availableSlots.map((slot) => (
                            <button
                              key={slot}
                              type="button"
                              onClick={() => setSelectedSlot(slot)}
                              className="py-2.5 px-3 rounded-lg border border-zinc-800 bg-zinc-900/50 hover:bg-primary/20 hover:border-primary text-sm font-semibold text-zinc-300 hover:text-white transition"
                            >
                              {slot}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Step 3: Complete Booking Form */}
              {selectedService && selectedSlot && (
                <div className="space-y-6">
                  <div className="flex items-center justify-between border-b border-zinc-800 pb-2">
                    <h3 className="text-lg font-semibold">Preencha seus dados</h3>
                    <Button variant="ghost" className="text-xs text-zinc-400 hover:text-white" onClick={() => setSelectedSlot(null)}>Voltar</Button>
                  </div>

                  <div className="p-4 bg-zinc-900/30 border border-zinc-800 rounded-xl space-y-2 text-sm text-zinc-300">
                    <p className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-emerald-500" /> {selectedService.name}</p>
                    <p className="flex items-center gap-2"><CalendarIcon className="h-4 w-4 text-primary" /> {format(parseISO(selectedDate), "dd 'de' MMMM 'de' yyyy", { locale: ptBR })}</p>
                    <p className="flex items-center gap-2"><Clock className="h-4 w-4 text-primary" /> {selectedSlot} ({selectedService.duration_minutes} min)</p>
                  </div>

                  <form onSubmit={handleConfirmBooking} className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="clientName">Seu Nome Completo *</Label>
                      <Input 
                        id="clientName"
                        className="bg-zinc-900 border-zinc-800 text-white"
                        value={clientName}
                        onChange={(e) => setClientName(e.target.value)}
                        placeholder="Ex: João Silva"
                        required
                      />
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="clientPhone">Telefone / WhatsApp *</Label>
                        <Input 
                          id="clientPhone"
                          className="bg-zinc-900 border-zinc-800 text-white"
                          value={clientPhone}
                          onChange={(e) => setClientPhone(e.target.value)}
                          placeholder="Ex: 11999999999"
                          required
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="clientEmail">E-mail (opcional)</Label>
                        <Input 
                          id="clientEmail"
                          type="email"
                          className="bg-zinc-900 border-zinc-800 text-white"
                          value={clientEmail}
                          onChange={(e) => setClientEmail(e.target.value)}
                          placeholder="Ex: joao@gmail.com"
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="clientNotes">Notas ou Observações (opcional)</Label>
                      <Input 
                        id="clientNotes"
                        className="bg-zinc-900 border-zinc-800 text-white"
                        value={clientNotes}
                        onChange={(e) => setClientNotes(e.target.value)}
                        placeholder="Alguma informação importante para o atendimento..."
                      />
                    </div>

                    <Button type="submit" className="w-full mt-4 font-bold text-white bg-primary hover:bg-primary/95 flex items-center justify-center gap-2 py-6 rounded-xl">
                      Confirmar Agendamento
                    </Button>
                  </form>
                </div>
              )}

            </CardContent>
          </Card>
        </div>

      </div>
    </div>
  )
}
