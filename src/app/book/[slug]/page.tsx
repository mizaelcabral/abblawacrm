'use client'

import { useState, useEffect, use } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'
import { Calendar as CalendarIcon, Clock, User, Phone, Mail, CheckCircle2, ChevronRight, FileText, DollarSign } from 'lucide-react'
import { format, addDays, parseISO } from 'date-fns'
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
    <div className="min-h-screen bg-gradient-to-br from-[#09090b] via-[#121214] to-[#09090b] text-white py-12 px-4 sm:px-6 lg:px-8 flex items-center justify-center">
      <div className="w-full max-w-5xl bg-zinc-950/40 backdrop-blur-xl border border-zinc-800/80 rounded-3xl overflow-hidden shadow-2xl shadow-black/80 grid grid-cols-1 md:grid-cols-12">
        
        {/* Profile Sidebar */}
        <div className="md:col-span-5 p-8 border-b md:border-b-0 md:border-r border-zinc-800/80 flex flex-col justify-between bg-zinc-900/10">
          <div className="space-y-6">
            <div className="flex items-center gap-4">
              <div className="h-16 w-16 rounded-2xl bg-gradient-to-br from-primary/30 to-primary/5 border border-primary/20 flex items-center justify-center text-2xl font-bold text-white shadow-lg shadow-primary/10">
                {profile.full_name.charAt(0)}
              </div>
              <div>
                <span className="text-xs font-semibold text-primary uppercase tracking-wider">Profissional</span>
                <h2 className="text-xl font-bold text-white tracking-tight">{profile.full_name}</h2>
              </div>
            </div>
            
            <p className="text-zinc-400 text-sm leading-relaxed">
              Agende um horário para atendimento online ou presencial com toda a conveniência.
            </p>

            {selectedService && (
              <div className="mt-8 p-5 bg-primary/5 border border-primary/10 rounded-2xl space-y-3 animate-fade-in">
                <span className="text-[10px] font-bold text-primary uppercase tracking-widest">Serviço Selecionado</span>
                <h4 className="font-bold text-white text-base">{selectedService.name}</h4>
                <div className="flex flex-wrap gap-4 text-xs text-zinc-400">
                  <span className="flex items-center gap-1.5"><Clock className="h-3.5 w-3.5 text-primary" /> {selectedService.duration_minutes} min</span>
                  <span className="flex items-center gap-1.5"><DollarSign className="h-3.5 w-3.5 text-primary" /> R$ {Number(selectedService.price).toFixed(2)}</span>
                </div>
              </div>
            )}
          </div>

          {/* Steps Indicator */}
          <div className="mt-12 space-y-4">
            <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-widest">Etapas do Agendamento</h3>
            <div className="space-y-3">
              <div className={`flex items-center gap-3 transition-all duration-300 ${selectedService ? 'text-zinc-500 line-through' : 'text-primary font-semibold'}`}>
                <span className={`h-6 w-6 rounded-lg border flex items-center justify-center text-xs font-bold transition-all ${selectedService ? 'border-zinc-800 bg-zinc-900' : 'border-primary/30 bg-primary/10'}`}>1</span>
                <span>Selecione o Serviço</span>
              </div>
              <div className={`flex items-center gap-3 transition-all duration-300 ${selectedService && !selectedSlot ? 'text-primary font-semibold' : 'text-zinc-500'}`}>
                <span className={`h-6 w-6 rounded-lg border flex items-center justify-center text-xs font-bold transition-all ${selectedService && !selectedSlot ? 'border-primary/30 bg-primary/10' : 'border-zinc-800 bg-zinc-900'}`}>2</span>
                <span>Escolha Data & Hora</span>
              </div>
              <div className={`flex items-center gap-3 transition-all duration-300 ${selectedSlot ? 'text-primary font-semibold' : 'text-zinc-500'}`}>
                <span className={`h-6 w-6 rounded-lg border flex items-center justify-center text-xs font-bold transition-all ${selectedSlot ? 'border-primary/30 bg-primary/10' : 'border-zinc-800 bg-zinc-900'}`}>3</span>
                <span>Confirme seus Dados</span>
              </div>
            </div>
          </div>
        </div>

        {/* Dynamic Booking Content */}
        <div className="md:col-span-7 p-8 md:p-10 flex flex-col justify-center min-h-[450px]">
          
          {/* Step 1: Select Service */}
          {!selectedService && (
            <div className="space-y-6">
              <div>
                <h3 className="text-2xl font-bold tracking-tight text-white">Serviços Disponíveis</h3>
                <p className="text-sm text-zinc-400 mt-1">Selecione o atendimento que deseja realizar.</p>
              </div>
              <div className="space-y-4">
                {services.map((svc) => (
                  <div 
                    key={svc.id} 
                    onClick={() => setSelectedService(svc)}
                    className="flex justify-between items-center p-5 rounded-2xl border border-zinc-800 bg-zinc-900/20 hover:bg-zinc-900/50 hover:border-primary/40 transition-all duration-300 cursor-pointer group shadow-lg hover:shadow-primary/5"
                  >
                    <div className="space-y-2">
                      <h4 className="font-bold text-white group-hover:text-primary transition duration-300 text-lg">{svc.name}</h4>
                      <p className="text-sm text-zinc-400">{svc.description || 'Atendimento personalizado com profissional qualificado.'}</p>
                      <div className="flex items-center gap-2 text-xs text-zinc-500 pt-1">
                        <span className="flex items-center gap-1"><Clock className="h-3.5 w-3.5" /> {svc.duration_minutes} min</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <span className="font-bold text-base text-zinc-200">R$ {Number(svc.price).toFixed(2)}</span>
                      <div className="h-8 w-8 rounded-lg bg-zinc-800/80 group-hover:bg-primary/20 flex items-center justify-center transition duration-300">
                        <ChevronRight className="h-4 w-4 text-zinc-400 group-hover:text-primary transition duration-300" />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Step 2: Date & Slot Selection */}
          {selectedService && !selectedSlot && (
            <div className="space-y-6">
              <div className="flex items-center justify-between border-b border-zinc-800/80 pb-4">
                <div>
                  <h3 className="text-xl font-bold text-white">Escolha data & horário</h3>
                  <p className="text-xs text-zinc-400 mt-0.5">Selecione o dia e o horário de sua preferência.</p>
                </div>
                <Button variant="ghost" className="text-xs text-zinc-400 hover:text-white border border-zinc-800 hover:bg-zinc-900 rounded-lg px-3 py-1.5" onClick={() => setSelectedService(null)}>Voltar</Button>
              </div>

              <div className="space-y-5">
                <div className="space-y-2">
                  <Label htmlFor="date" className="text-sm font-semibold text-zinc-300">Data do Atendimento</Label>
                  <div className="relative">
                    <Input 
                      id="date"
                      type="date"
                      className="bg-zinc-900/60 border-zinc-800 text-white rounded-xl py-6 pl-4 pr-10 focus:border-primary/50 transition"
                      min={format(new Date(), 'yyyy-MM-dd')}
                      max={format(addDays(new Date(), 30), 'yyyy-MM-dd')}
                      value={selectedDate}
                      onChange={(e) => setSelectedDate(e.target.value)}
                    />
                  </div>
                </div>

                <div className="space-y-3">
                  <Label className="text-sm font-semibold text-zinc-300">Horários Disponíveis</Label>
                  {loadingSlots ? (
                    <div className="flex justify-center py-8">
                      <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                    </div>
                  ) : availableSlots.length === 0 ? (
                    <div className="border border-dashed border-zinc-800 rounded-2xl py-8 text-center bg-zinc-900/5">
                      <p className="text-sm text-zinc-500 italic">Nenhum horário disponível para este dia.</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                      {availableSlots.map((slot) => (
                        <button
                          key={slot}
                          type="button"
                          onClick={() => setSelectedSlot(slot)}
                          className="py-3 px-4 rounded-xl border border-zinc-800 bg-zinc-900/20 hover:bg-primary/10 hover:border-primary text-sm font-bold text-zinc-300 hover:text-white transition duration-300 shadow-md"
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
              <div className="flex items-center justify-between border-b border-zinc-800/80 pb-4">
                <div>
                  <h3 className="text-xl font-bold text-white">Insira seus dados</h3>
                  <p className="text-xs text-zinc-400 mt-0.5">Preencha as informações para confirmar o agendamento.</p>
                </div>
                <Button variant="ghost" className="text-xs text-zinc-400 hover:text-white border border-zinc-800 hover:bg-zinc-900 rounded-lg px-3 py-1.5" onClick={() => setSelectedSlot(null)}>Voltar</Button>
              </div>

              <form onSubmit={handleConfirmBooking} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="clientName" className="text-sm text-zinc-300">Seu Nome Completo *</Label>
                  <Input 
                    id="clientName"
                    className="bg-zinc-900/60 border-zinc-800 text-white rounded-xl py-5"
                    value={clientName}
                    onChange={(e) => setClientName(e.target.value)}
                    placeholder="Ex: João Silva"
                    required
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="clientPhone" className="text-sm text-zinc-300">WhatsApp / Telefone *</Label>
                    <Input 
                      id="clientPhone"
                      className="bg-zinc-900/60 border-zinc-800 text-white rounded-xl py-5"
                      value={clientPhone}
                      onChange={(e) => setClientPhone(e.target.value)}
                      placeholder="Ex: 11999999999"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="clientEmail" className="text-sm text-zinc-300">E-mail (opcional)</Label>
                    <Input 
                      id="clientEmail"
                      type="email"
                      className="bg-zinc-900/60 border-zinc-800 text-white rounded-xl py-5"
                      value={clientEmail}
                      onChange={(e) => setClientEmail(e.target.value)}
                      placeholder="Ex: joao@gmail.com"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="clientNotes" className="text-sm text-zinc-300">Observações (opcional)</Label>
                  <Input 
                    id="clientNotes"
                    className="bg-zinc-900/60 border-zinc-800 text-white rounded-xl py-5"
                    value={clientNotes}
                    onChange={(e) => setClientNotes(e.target.value)}
                    placeholder="Informações relevantes para o seu atendimento..."
                  />
                </div>

                <Button type="submit" className="w-full mt-4 font-bold text-white bg-primary hover:bg-primary/95 flex items-center justify-center gap-2 py-6 rounded-xl transition duration-300 shadow-lg shadow-primary/20">
                  Confirmar Agendamento
                </Button>
              </form>
            </div>
          )}

        </div>
      </div>
    </div>
  )
}
