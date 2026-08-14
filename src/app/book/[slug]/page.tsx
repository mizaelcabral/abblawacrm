'use client'

import { useState, useEffect, use } from 'react'
import { createClient } from '@/lib/supabase/client'
import { getCleanSlug } from '@/lib/utils'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'
import { Calendar as CalendarIcon, Clock, User, Phone, Mail, CheckCircle2, ChevronRight, FileText, DollarSign, Video, MapPin, ExternalLink, Loader2, Sparkles, Sun, Moon } from 'lucide-react'
import { format, addDays, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'

interface Service {
  id: string
  name: string
  description: string | null
  duration_minutes: number
  price: number
  location_type?: 'online' | 'presencial' | 'ambos'
  online_meeting_url?: string | null
  physical_address?: string | null
  provider_name?: string | null
  provider_avatar_url?: string | null
  show_provider_avatar?: boolean
  clinic_name?: string | null
  clinic_logo_url?: string | null
  show_clinic_logo?: boolean
  payment_required?: boolean
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
  const [theme, setTheme] = useState<'light' | 'dark'>('light')

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
  const [waitingPayment, setWaitingPayment] = useState(false)
  const [verifyingPayment, setVerifyingPayment] = useState(false)
  const [copied, setCopied] = useState(false)

  const supabase = createClient()

  useEffect(() => {
    if (!waitingPayment || !bookingData?.id) return

    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/appointments/status?id=${bookingData.id}`)
        if (res.ok) {
          const data = await res.json()
          if (data.status === 'confirmed') {
            if (data.appointment) setBookingData(data.appointment)
            setBookingSuccess(true)
            setWaitingPayment(false)
            toast.success('Pagamento Pix confirmado e agendamento concluído!')
          }
        }
      } catch (err) {
        console.error('Erro ao verificar status de pagamento:', err)
      }
    }, 4000)

    return () => clearInterval(interval)
  }, [waitingPayment, bookingData?.id])

  const handleCheckPayment = async () => {
    if (!bookingData?.id) return
    try {
      setVerifyingPayment(true)
      const res = await fetch(`/api/appointments/status?id=${bookingData.id}&check=true`)
      if (res.ok) {
        const data = await res.json()
        if (data.status === 'confirmed') {
          if (data.appointment) setBookingData(data.appointment)
          setBookingSuccess(true)
          setWaitingPayment(false)
          toast.success('Pagamento Pix verificado com sucesso! Agendamento confirmado.')
        } else {
          toast.info('Pagamento Pix ainda em processamento. Tente novamente em alguns segundos.')
        }
      } else {
        toast.error('Erro ao verificar status do pagamento.')
      }
    } catch (err) {
      toast.error('Erro de conexão ao verificar pagamento.')
    } finally {
      setVerifyingPayment(false)
    }
  }
  // Load Profile and Services
  useEffect(() => {
    async function loadProfileAndServices() {
      try {
        setLoading(true)
        const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(profileId)

        let targetProfile: Profile | null = null

        // 1. Search in profiles (by id, account_id, or slug)
        if (isUuid) {
          const { data: prof } = await supabase
            .from('profiles')
            .select('id, full_name, avatar_url, account_id')
            .or(`id.eq.${profileId},account_id.eq.${profileId},slug.eq.${profileId}`)
            .limit(1)
            .maybeSingle()

          if (prof) targetProfile = prof
        } else {
          const { data: prof } = await supabase
            .from('profiles')
            .select('id, full_name, avatar_url, account_id')
            .eq('slug', profileId)
            .limit(1)
            .maybeSingle()

          if (prof) targetProfile = prof
        }

        // 2. Fallback: Search woovi_config by store_slug
        if (!targetProfile) {
          const { data: woovi } = await supabase
            .from('woovi_config')
            .select('account_id')
            .eq('store_slug', profileId)
            .limit(1)
            .maybeSingle()

          if (woovi?.account_id) {
            const { data: prof } = await supabase
              .from('profiles')
              .select('id, full_name, avatar_url, account_id')
              .eq('account_id', woovi.account_id)
              .limit(1)
              .maybeSingle()

            if (prof) targetProfile = prof
          }
        }

        // 3. Fallback: Search accounts by slug
        if (!targetProfile) {
          const { data: acc } = await supabase
            .from('accounts')
            .select('id')
            .eq('slug', profileId)
            .limit(1)
            .maybeSingle()

          if (acc?.id) {
            const { data: prof } = await supabase
              .from('profiles')
              .select('id, full_name, avatar_url, account_id')
              .eq('account_id', acc.id)
              .limit(1)
              .maybeSingle()

            if (prof) targetProfile = prof
          }
        }

        // 4. Fallback: Search profiles by full_name matching normalized slug (e.g. mizael-cabral -> Mizael Cabral)
        if (!targetProfile) {
          const searchName = profileId.replace(/-/g, '%')
          const { data: profsByName } = await supabase
            .from('profiles')
            .select('id, full_name, avatar_url, account_id, slug')
            .ilike('full_name', `%${searchName}%`)

          if (profsByName && profsByName.length > 0) {
            const match = profsByName.find((p) => getCleanSlug(p) === profileId) || profsByName[0]
            targetProfile = match
          }
        }

        // 5. Universal Fallback: Fetch profiles and match using getCleanSlug
        if (!targetProfile) {
          const { data: allProfs } = await supabase
            .from('profiles')
            .select('id, full_name, avatar_url, account_id, slug')
            .limit(100)

          if (allProfs) {
            const match = allProfs.find((p) => getCleanSlug(p) === profileId)
            if (match) targetProfile = match
          }
        }

        // 6. Single Account Fallback: If only 1 profile exists, load it
        if (!targetProfile) {
          const { data: singleProf } = await supabase
            .from('profiles')
            .select('id, full_name, avatar_url, account_id, slug')
            .limit(1)
            .maybeSingle()

          if (singleProf) targetProfile = singleProf
        }

        if (!targetProfile) {
          toast.error('Profissional não encontrado')
          setLoading(false)
          return
        }

        setProfile(targetProfile)

        // Fetch active services under the account
        let { data: svcs, error: svcsError } = await supabase
          .from('services')
          .select('*')
          .eq('account_id', targetProfile.account_id)
          .eq('is_active', true)

        if (!svcs || svcs.length === 0) {
          const { data: allSvcs } = await supabase
            .from('services')
            .select('*')
            .eq('account_id', targetProfile.account_id)
          if (allSvcs && allSvcs.length > 0) svcs = allSvcs
        }

        if (svcsError && (!svcs || svcs.length === 0)) {
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
    if (!selectedService || !selectedDate || !profile?.id) return
    const currentProfileId = profile.id

    async function fetchSlots() {
      try {
        setLoadingSlots(true)
        setSelectedSlot(null)
        const res = await fetch(`/api/appointments/availability?profile_id=${currentProfileId}&date=${selectedDate}&service_id=${selectedService?.id}`)
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
  }, [selectedService, selectedDate, profile?.id])

  // Active service for branding fallback in sidebar
  const activeService = selectedService || services.find(s => (s.show_clinic_logo && s.clinic_logo_url) || (s.show_provider_avatar && s.provider_avatar_url)) || null

  // Confirm booking
  const handleConfirmBooking = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedService || !selectedDate || !selectedSlot || !clientName || !clientPhone || !profile?.id) {
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
          profile_id: profile.id,
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
        if (data.status === 'pending') {
          setWaitingPayment(true)
          toast.info('Agendamento pré-reservado. Realize o pagamento via Pix para confirmar!')
        } else {
          setBookingSuccess(true)
          toast.success('Agendamento confirmado com sucesso!')
        }
      } else {
        const err = await res.json()
        toast.error(err.error || 'Erro ao realizar agendamento')
      }
    } catch (error) {
      toast.error('Erro de conexão ao realizar agendamento')
    }
  }

  const isDark = theme === 'dark'

  const renderThemeToggle = () => (
    <button
      type="button"
      onClick={() => setTheme(prev => prev === 'light' ? 'dark' : 'light')}
      className={`inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-semibold shadow-md transition-all duration-200 border cursor-pointer shrink-0 ${
        isDark
          ? 'bg-zinc-900/90 border-zinc-700 text-zinc-200 hover:bg-zinc-800 hover:text-white'
          : 'bg-white/90 border-slate-300 text-slate-700 hover:bg-slate-100 hover:text-slate-900'
      }`}
    >
      {isDark ? (
        <>
          <Sun className="h-3.5 w-3.5 text-amber-400" />
          <span>Modo Claro</span>
        </>
      ) : (
        <>
          <Moon className="h-3.5 w-3.5 text-indigo-600" />
          <span>Modo Escuro</span>
        </>
      )}
    </button>
  )

  if (loading) {
    return (
      <div className={`flex min-h-screen items-center justify-center transition-colors duration-300 ${isDark ? 'bg-[#09090b] text-white' : 'bg-slate-50 text-slate-900'}`}>
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <p className={`text-sm ${isDark ? 'text-zinc-400' : 'text-slate-500'}`}>Carregando formulário de agendamento...</p>
        </div>
      </div>
    )
  }

  if (!profile) {
    return (
      <div className={`flex min-h-screen items-center justify-center transition-colors duration-300 ${isDark ? 'bg-[#09090b] text-white' : 'bg-slate-50 text-slate-900'}`}>
        <div className="text-center space-y-4">
          <h1 className="text-2xl font-bold text-red-500">Link Inválido</h1>
          <p className={isDark ? 'text-zinc-400' : 'text-slate-500'}>O profissional requisitado não foi localizado no sistema.</p>
        </div>
      </div>
    )
  }

  if (waitingPayment && bookingData) {
    return (
      <div className={`min-h-screen flex flex-col items-center justify-center p-4 transition-colors duration-300 ${isDark ? 'bg-[#09090b] text-white' : 'bg-slate-50 text-slate-900'}`}>
        <div className="w-full max-w-md flex justify-end mb-3">
          {renderThemeToggle()}
        </div>
        <Card className={`w-full max-w-md border backdrop-blur-xl shadow-2xl transition-colors duration-300 ${isDark ? 'border-zinc-800 bg-zinc-950/80 text-white' : 'border-slate-200 bg-white text-slate-900 shadow-slate-200/80'}`}>
          <CardContent className="pt-6 text-center space-y-6">
            <div className="flex justify-center">
              <div className="h-10 w-10 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            </div>
            <div className="space-y-2">
              <h2 className={`text-2xl font-bold tracking-tight ${isDark ? 'text-white' : 'text-slate-900'}`}>Aguardando Pagamento Pix</h2>
              <p className={`text-sm ${isDark ? 'text-zinc-400' : 'text-slate-500'}`}>Realize o Pix para confirmar seu agendamento imediatamente.</p>
            </div>

            {bookingData.woovi_qrcode_image && (
              <div className="flex justify-center border-4 border-white p-2 rounded-xl bg-white max-w-[220px] mx-auto shadow-lg">
                <img src={bookingData.woovi_qrcode_image} alt="QR Code Pix" className="w-full h-auto" />
              </div>
            )}

            {bookingData.woovi_brcode && (
              <div className="space-y-2">
                <p className={`text-xs font-medium ${isDark ? 'text-zinc-400' : 'text-slate-500'}`}>Pix Copia e Cola:</p>
                <div className={`flex items-center gap-2 border rounded-xl p-2 max-w-sm mx-auto ${isDark ? 'bg-zinc-900 border-zinc-800' : 'bg-slate-50 border-slate-300'}`}>
                  <input
                    type="text"
                    readOnly
                    value={bookingData.woovi_brcode}
                    className={`bg-transparent text-xs flex-1 outline-none truncate font-mono px-1 ${isDark ? 'text-zinc-300' : 'text-slate-800'}`}
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    className={`text-xs px-3 shrink-0 ${isDark ? 'border-zinc-700 hover:bg-zinc-800 text-zinc-300' : 'border-slate-300 hover:bg-slate-200 text-slate-700'}`}
                    onClick={() => {
                      navigator.clipboard.writeText(bookingData.woovi_brcode)
                      setCopied(true)
                      toast.success('Código Pix copiado!')
                      setTimeout(() => setCopied(false), 2000)
                    }}
                  >
                    {copied ? 'Copiado' : 'Copiar'}
                  </Button>
                </div>
              </div>
            )}

            <div className={`border rounded-xl p-4 text-left space-y-2 text-xs ${isDark ? 'border-zinc-800 bg-zinc-900/50 text-zinc-300' : 'border-slate-200 bg-slate-50 text-slate-700'}`}>
              <p><strong>Serviço:</strong> <span className={isDark ? 'text-white' : 'text-slate-900'}>{bookingData?.service?.name || selectedService?.name}</span></p>
              {bookingData?.start_time && (
                <>
                  <p><strong>Data:</strong> <span className={isDark ? 'text-white' : 'text-slate-900'}>{format(parseISO(bookingData.start_time), "dd 'de' MMMM 'de' yyyy", { locale: ptBR })}</span></p>
                  <p><strong>Horário:</strong> <span className={isDark ? 'text-white' : 'text-slate-900'}>{format(parseISO(bookingData.start_time), 'HH:mm')}</span></p>
                </>
              )}
            </div>

            <Button
              onClick={handleCheckPayment}
              disabled={verifyingPayment}
              className="w-full h-11 bg-emerald-600 hover:bg-emerald-700 font-bold text-white shadow-lg shadow-emerald-600/20 flex items-center justify-center gap-2 rounded-xl transition duration-200"
            >
              {verifyingPayment ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Verificando Pagamento...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-4 w-4" />
                  <span>Já fiz o pagamento! (Verificar)</span>
                </>
              )}
            </Button>

            <p className={`text-[11px] animate-pulse ${isDark ? 'text-zinc-500' : 'text-slate-400'}`}>Detectando pagamento Pix automaticamente...</p>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (bookingSuccess) {
    const isOnline = bookingData?.location_type === 'online' || bookingData?.meeting_url || selectedService?.location_type === 'online'
    const isPresencial = bookingData?.location_type === 'presencial' || bookingData?.location_address || selectedService?.location_type === 'presencial'
    const meetingUrl = bookingData?.meeting_url || selectedService?.online_meeting_url
    const physicalAddress = bookingData?.location_address || selectedService?.physical_address

    return (
      <div className={`min-h-screen flex flex-col items-center justify-center p-4 transition-colors duration-300 ${isDark ? 'bg-[#09090b] text-white' : 'bg-slate-50 text-slate-900'}`}>
        <div className="w-full max-w-lg flex justify-end mb-3">
          {renderThemeToggle()}
        </div>
        <Card className={`w-full max-w-lg border backdrop-blur-2xl shadow-2xl rounded-3xl transition-colors duration-300 ${isDark ? 'border-zinc-800 bg-zinc-950/90 text-white shadow-emerald-950/20' : 'border-slate-200 bg-white text-slate-900 shadow-slate-200/80'}`}>
          <CardContent className="pt-8 text-center space-y-6">
            <div className="flex justify-center">
              <div className="relative flex items-center justify-center">
                <div className="absolute h-20 w-20 rounded-full bg-emerald-500/20 animate-ping" />
                <div className="h-16 w-16 rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center">
                  <CheckCircle2 className="h-10 w-10 text-emerald-500" />
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-xs font-bold uppercase tracking-wider">
                <Sparkles className="h-3.5 w-3.5" /> Agendamento Confirmado!
              </div>
              <h2 className={`text-2xl font-extrabold tracking-tight ${isDark ? 'text-white' : 'text-slate-900'}`}>Tudo pronto para a sua consulta</h2>
              <p className={`text-xs sm:text-sm ${isDark ? 'text-zinc-400' : 'text-slate-500'}`}>Seu pagamento Pix foi verificado e seu atendimento está garantido.</p>
            </div>

            {/* Ticket Card */}
            <div className={`border rounded-2xl p-5 text-left space-y-4 shadow-inner ${isDark ? 'border-zinc-800 bg-zinc-900/60' : 'border-slate-200 bg-slate-50'}`}>
              <div className={`flex items-center justify-between pb-3 border-b ${isDark ? 'border-zinc-800' : 'border-slate-200'}`}>
                <span className="text-xs font-bold text-primary uppercase tracking-wider">Comprovante de Agendamento</span>
                <span className="text-xs px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-600 dark:text-emerald-300 font-medium">Pago via Pix</span>
              </div>

              <div className={`space-y-2 text-xs sm:text-sm ${isDark ? 'text-zinc-300' : 'text-slate-700'}`}>
                <p className="flex justify-between">
                  <span className={isDark ? 'text-zinc-500' : 'text-slate-400'}>Serviço:</span>
                  <span className={`font-semibold ${isDark ? 'text-white' : 'text-slate-900'}`}>{bookingData?.service?.name || selectedService?.name}</span>
                </p>
                {bookingData?.start_time && (
                  <>
                    <p className="flex justify-between">
                      <span className={isDark ? 'text-zinc-500' : 'text-slate-400'}>Data:</span>
                      <span className={`font-semibold ${isDark ? 'text-white' : 'text-slate-900'}`}>{format(parseISO(bookingData.start_time), "EEEE, dd 'de' MMMM 'de' yyyy", { locale: ptBR })}</span>
                    </p>
                    <p className="flex justify-between">
                      <span className={isDark ? 'text-zinc-500' : 'text-slate-400'}>Horário:</span>
                      <span className={`font-semibold ${isDark ? 'text-white' : 'text-slate-900'}`}>{format(parseISO(bookingData.start_time), 'HH:mm')}</span>
                    </p>
                  </>
                )}
                <p className="flex justify-between">
                  <span className={isDark ? 'text-zinc-500' : 'text-slate-400'}>Profissional:</span>
                  <span className={`font-semibold ${isDark ? 'text-white' : 'text-slate-900'}`}>{bookingData?.service?.provider_name || selectedService?.provider_name || profile.full_name}</span>
                </p>
              </div>

              {/* Online or Presencial Box */}
              {isOnline && meetingUrl && (
                <div className="p-4 bg-primary/10 border border-primary/20 rounded-xl space-y-2">
                  <div className="flex items-center gap-2 text-xs font-bold text-primary">
                    <Video className="h-4 w-4" /> Atendimento Online (Telemedicina)
                  </div>
                  <p className={`text-[11px] ${isDark ? 'text-zinc-400' : 'text-slate-500'}`}>Acesse a sala virtual no horário agendado:</p>
                  <a
                    href={meetingUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center justify-center gap-2 w-full py-2.5 px-4 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold text-xs rounded-lg transition shadow-md"
                  >
                    <span>Acessar Sala Virtual</span>
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                </div>
              )}

              {isPresencial && physicalAddress && (
                <div className={`p-4 border rounded-xl space-y-2 ${isDark ? 'bg-zinc-800/50 border-zinc-700/50' : 'bg-white border-slate-200'}`}>
                  <div className="flex items-center gap-2 text-xs font-bold text-primary">
                    <MapPin className="h-4 w-4" /> Endereço do Consultório
                  </div>
                  <p className={`text-xs font-medium ${isDark ? 'text-zinc-300' : 'text-slate-700'}`}>{physicalAddress}</p>
                </div>
              )}
            </div>

            <p className={`text-[11px] ${isDark ? 'text-zinc-500' : 'text-slate-400'}`}>
              Enviamos um lembrete com os detalhes da consulta para o seu telefone via WhatsApp.
            </p>

            <Button
              type="button"
              onClick={() => window.location.reload()}
              className={`w-full h-12 font-bold border shadow-xl rounded-xl text-xs sm:text-sm flex items-center justify-center gap-2 transition-all duration-200 ${
                isDark
                  ? 'bg-zinc-900 hover:bg-zinc-800 text-white border-zinc-700 hover:border-emerald-500/50 shadow-black/60'
                  : 'bg-slate-900 hover:bg-slate-800 text-white border-slate-800 hover:border-emerald-600/50 shadow-slate-300/50'
              }`}
            >
              <CalendarIcon className="h-4 w-4 text-emerald-500" />
              <span className="text-white font-bold tracking-wide">Fazer Novo Agendamento</span>
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className={`min-h-screen py-10 px-4 sm:px-6 lg:px-8 flex flex-col items-center justify-center transition-colors duration-300 ${
      isDark
        ? 'bg-gradient-to-br from-[#09090b] via-[#121214] to-[#09090b] text-white'
        : 'bg-gradient-to-br from-slate-50 via-white to-slate-100 text-slate-900'
    }`}>
      
      {/* Top Header Bar with Theme Toggle */}
      <div className="w-full max-w-5xl flex justify-end mb-3 px-2">
        {renderThemeToggle()}
      </div>

      <div className={`w-full max-w-5xl backdrop-blur-xl border rounded-3xl overflow-hidden shadow-2xl transition-colors duration-300 grid grid-cols-1 md:grid-cols-12 ${
        isDark
          ? 'bg-zinc-950/40 border-zinc-800/80 shadow-black/80'
          : 'bg-white/90 border-slate-200/90 shadow-slate-300/60'
      }`}>
        
        {/* Profile Sidebar */}
        <div className={`md:col-span-5 p-8 border-b md:border-b-0 md:border-r flex flex-col justify-between transition-colors duration-300 ${
          isDark
            ? 'border-zinc-800/80 bg-zinc-900/10'
            : 'border-slate-200 bg-slate-50/50'
        }`}>
          <div className="space-y-6">
            {/* Clinic Logo Header if enabled */}
            {activeService?.show_clinic_logo && activeService?.clinic_logo_url && (
              <div className={`flex items-center gap-3 pb-4 border-b ${isDark ? 'border-zinc-800/80' : 'border-slate-200'}`}>
                <img
                  src={activeService.clinic_logo_url}
                  alt={activeService.clinic_name || 'Clínica'}
                  className="h-10 max-w-[160px] object-contain"
                />
                {activeService.clinic_name && (
                  <span className={`text-xs font-bold ${isDark ? 'text-zinc-300' : 'text-slate-700'}`}>{activeService.clinic_name}</span>
                )}
              </div>
            )}

            <div className="flex items-center gap-4">
              {activeService?.show_provider_avatar && activeService?.provider_avatar_url ? (
                <img
                  src={activeService.provider_avatar_url}
                  alt={activeService.provider_name || profile.full_name}
                  className="h-16 w-16 rounded-2xl object-cover border border-primary/30 shadow-lg shadow-primary/10"
                />
              ) : profile.avatar_url ? (
                <img
                  src={profile.avatar_url}
                  alt={profile.full_name}
                  className="h-16 w-16 rounded-2xl object-cover border border-primary/30 shadow-lg shadow-primary/10"
                />
              ) : (
                <div className="h-16 w-16 rounded-2xl bg-gradient-to-br from-primary/30 to-primary/5 border border-primary/20 flex items-center justify-center text-2xl font-bold text-primary shadow-lg shadow-primary/10">
                  {profile.full_name.charAt(0)}
                </div>
              )}
              <div>
                <span className="text-xs font-semibold text-primary uppercase tracking-wider">Profissional</span>
                <h2 className={`text-xl font-bold tracking-tight ${isDark ? 'text-white' : 'text-slate-900'}`}>
                  {activeService?.show_provider_avatar && activeService?.provider_name
                    ? activeService.provider_name
                    : profile.full_name}
                </h2>
              </div>
            </div>
            
            <p className={`text-sm leading-relaxed ${isDark ? 'text-zinc-400' : 'text-slate-600'}`}>
              Agende um horário para atendimento online ou presencial com toda a conveniência.
            </p>

            {selectedService && (
              <div className="mt-8 p-5 bg-primary/5 border border-primary/15 rounded-2xl space-y-3 animate-fade-in">
                <span className="text-[10px] font-bold text-primary uppercase tracking-widest">Serviço Selecionado</span>
                <h4 className={`font-bold text-base ${isDark ? 'text-white' : 'text-slate-900'}`}>{selectedService.name}</h4>
                <div className={`flex flex-wrap gap-4 text-xs ${isDark ? 'text-zinc-400' : 'text-slate-600'}`}>
                  <span className="flex items-center gap-1"><Clock className="h-3.5 w-3.5 text-primary" /> {selectedService.duration_minutes} min</span>
                  <span className="flex items-center gap-1"><DollarSign className="h-3.5 w-3.5 text-primary" /> R$ {Number(selectedService.price).toFixed(2)}</span>
                </div>
              </div>
            )}
          </div>

          {/* Steps Indicator */}
          <div className="mt-12 space-y-4">
            <h3 className={`text-xs font-bold uppercase tracking-widest ${isDark ? 'text-zinc-500' : 'text-slate-400'}`}>Etapas do Agendamento</h3>
            <div className="space-y-3">
              <div className={`flex items-center gap-3 transition-all duration-300 ${selectedService ? (isDark ? 'text-zinc-500 line-through' : 'text-slate-400 line-through') : 'text-primary font-semibold'}`}>
                <span className={`h-6 w-6 rounded-lg border flex items-center justify-center text-xs font-bold transition-all ${selectedService ? (isDark ? 'border-zinc-800 bg-zinc-900' : 'border-slate-300 bg-slate-200 text-slate-500') : 'border-primary/30 bg-primary/10 text-primary'}`}>1</span>
                <span>Selecione o Serviço</span>
              </div>
              <div className={`flex items-center gap-3 transition-all duration-300 ${selectedService && !selectedSlot ? 'text-primary font-semibold' : selectedSlot ? (isDark ? 'text-zinc-500 line-through' : 'text-slate-400 line-through') : (isDark ? 'text-zinc-500' : 'text-slate-400')}`}>
                <span className={`h-6 w-6 rounded-lg border flex items-center justify-center text-xs font-bold transition-all ${selectedService && !selectedSlot ? 'border-primary/30 bg-primary/10 text-primary' : (isDark ? 'border-zinc-800 bg-zinc-900' : 'border-slate-300 bg-slate-200 text-slate-500')}`}>2</span>
                <span>Escolha Data & Hora</span>
              </div>
              <div className={`flex items-center gap-3 transition-all duration-300 ${selectedSlot && !waitingPayment ? 'text-primary font-semibold' : waitingPayment ? (isDark ? 'text-zinc-500 line-through' : 'text-slate-400 line-through') : (isDark ? 'text-zinc-500' : 'text-slate-400')}`}>
                <span className={`h-6 w-6 rounded-lg border flex items-center justify-center text-xs font-bold transition-all ${selectedSlot && !waitingPayment ? 'border-primary/30 bg-primary/10 text-primary' : (isDark ? 'border-zinc-800 bg-zinc-900' : 'border-slate-300 bg-slate-200 text-slate-500')}`}>3</span>
                <span>Confirme seus Dados</span>
              </div>
              {(selectedService?.payment_required ?? activeService?.payment_required ?? services.some(s => s.payment_required)) && (
                <div className={`flex items-center gap-3 transition-all duration-300 ${waitingPayment ? 'text-primary font-semibold' : (isDark ? 'text-zinc-500' : 'text-slate-400')}`}>
                  <span className={`h-6 w-6 rounded-lg border flex items-center justify-center text-xs font-bold transition-all ${waitingPayment ? 'border-primary/30 bg-primary/10 font-bold text-primary' : (isDark ? 'border-zinc-800 bg-zinc-900' : 'border-slate-300 bg-slate-200 text-slate-500')}`}>4</span>
                  <span>Pagamento via Pix (Woovi)</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Dynamic Booking Content */}
        <div className="md:col-span-7 p-8 md:p-10 flex flex-col justify-center min-h-[450px]">
          
          {/* Step 1: Select Service */}
          {!selectedService && (
            <div className="space-y-6">
              <div>
                <h3 className={`text-2xl font-bold tracking-tight ${isDark ? 'text-white' : 'text-slate-900'}`}>Serviços Disponíveis</h3>
                <p className={`text-sm mt-1 ${isDark ? 'text-zinc-400' : 'text-slate-500'}`}>Selecione o atendimento que deseja realizar.</p>
              </div>
              <div className="space-y-4">
                {services.length === 0 ? (
                  <div className={`border border-dashed rounded-3xl py-12 text-center ${isDark ? 'border-zinc-800 bg-zinc-900/5' : 'border-slate-300 bg-slate-50'}`}>
                    <p className={`text-sm italic ${isDark ? 'text-zinc-500' : 'text-slate-400'}`}>Nenhum serviço ativo cadastrado para este profissional.</p>
                  </div>
                ) : (
                  services.map((svc) => (
                    <div 
                      key={svc.id} 
                      onClick={() => setSelectedService(svc)}
                      className={`flex justify-between items-center p-5 rounded-2xl border transition-all duration-300 cursor-pointer group shadow-md ${
                        isDark
                          ? 'border-zinc-800 bg-zinc-900/20 hover:bg-zinc-900/50 hover:border-primary/40'
                          : 'border-slate-200 bg-white hover:bg-slate-50 hover:border-primary/50 shadow-slate-200/50'
                      }`}
                    >
                      <div className="space-y-3 flex-1 mr-4">
                        {((svc.show_clinic_logo && (svc.clinic_logo_url || svc.clinic_name)) || (svc.show_provider_avatar && (svc.provider_avatar_url || svc.provider_name))) && (
                          <div className={`flex flex-wrap items-center gap-3 pb-2 border-b ${isDark ? 'border-zinc-800/50' : 'border-slate-200'}`}>
                            {svc.show_clinic_logo && (svc.clinic_logo_url || svc.clinic_name) && (
                              <div className="flex items-center gap-2">
                                {svc.clinic_logo_url && (
                                  <img
                                    src={svc.clinic_logo_url}
                                    alt={svc.clinic_name || 'Clínica'}
                                    className="h-6 max-w-[100px] object-contain"
                                  />
                                )}
                                {svc.clinic_name && (
                                  <span className={`text-xs font-semibold ${isDark ? 'text-zinc-300' : 'text-slate-700'}`}>{svc.clinic_name}</span>
                                )}
                              </div>
                            )}

                            {svc.show_clinic_logo && svc.show_provider_avatar && (svc.clinic_logo_url || svc.clinic_name) && (svc.provider_avatar_url || svc.provider_name) && (
                              <span className={isDark ? 'text-zinc-600' : 'text-slate-300'}>•</span>
                            )}

                            {svc.show_provider_avatar && (svc.provider_avatar_url || svc.provider_name) && (
                              <div className="flex items-center gap-2">
                                {svc.provider_avatar_url && (
                                  <img
                                    src={svc.provider_avatar_url}
                                    alt={svc.provider_name || 'Profissional'}
                                    className={`h-6 w-6 rounded-full object-cover border ${isDark ? 'border-zinc-700' : 'border-slate-300'}`}
                                  />
                                )}
                                {svc.provider_name && (
                                  <span className={`text-xs font-medium ${isDark ? 'text-zinc-400' : 'text-slate-500'}`}>{svc.provider_name}</span>
                                )}
                              </div>
                            )}
                          </div>
                        )}

                        <div>
                          <h4 className={`font-bold transition duration-300 text-lg ${isDark ? 'text-white group-hover:text-primary' : 'text-slate-900 group-hover:text-primary'}`}>{svc.name}</h4>
                          <p className={`text-sm mt-1 ${isDark ? 'text-zinc-400' : 'text-slate-600'}`}>{svc.description || 'Atendimento personalizado com profissional qualificado.'}</p>
                        </div>

                        <div className={`flex items-center gap-2 text-xs pt-1 ${isDark ? 'text-zinc-500' : 'text-slate-400'}`}>
                          <span className="flex items-center gap-1"><Clock className="h-3.5 w-3.5 text-primary" /> {svc.duration_minutes} min</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-4 shrink-0">
                        <span className={`font-bold text-base ${isDark ? 'text-zinc-200' : 'text-slate-900'}`}>R$ {Number(svc.price).toFixed(2)}</span>
                        <div className={`h-8 w-8 rounded-lg flex items-center justify-center transition duration-300 ${isDark ? 'bg-zinc-800/80 group-hover:bg-primary/20' : 'bg-slate-100 group-hover:bg-primary/10'}`}>
                          <ChevronRight className={`h-4 w-4 transition duration-300 ${isDark ? 'text-zinc-400 group-hover:text-primary' : 'text-slate-500 group-hover:text-primary'}`} />
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {/* Step 2: Date & Slot Selection */}
          {selectedService && !selectedSlot && (
            <div className="space-y-6">
              <div className={`flex items-center justify-between border-b pb-4 ${isDark ? 'border-zinc-800/80' : 'border-slate-200'}`}>
                <div>
                  <h3 className={`text-xl font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>Escolha data & horário</h3>
                  <p className={`text-xs mt-0.5 ${isDark ? 'text-zinc-400' : 'text-slate-500'}`}>Selecione o dia e o horário de sua preferência.</p>
                </div>
                <Button variant="ghost" className={`text-xs border rounded-lg px-3 py-1.5 ${isDark ? 'text-zinc-400 hover:text-white border-zinc-800 hover:bg-zinc-900' : 'text-slate-600 hover:text-slate-900 border-slate-300 hover:bg-slate-100'}`} onClick={() => setSelectedService(null)}>Voltar</Button>
              </div>

              <div className="space-y-5">
                <div className="space-y-2">
                  <Label htmlFor="date" className={`text-sm font-semibold ${isDark ? 'text-zinc-300' : 'text-slate-700'}`}>Data do Atendimento</Label>
                  <div className="relative">
                    <Input 
                      id="date"
                      type="date"
                      className={`rounded-xl py-6 pl-4 pr-10 transition font-medium ${isDark ? 'bg-zinc-900/60 border-zinc-800 text-white focus:border-primary/50' : 'bg-slate-50 border-slate-300 text-slate-900 focus:bg-white'}`}
                      min={format(new Date(), 'yyyy-MM-dd')}
                      max={format(addDays(new Date(), 30), 'yyyy-MM-dd')}
                      value={selectedDate}
                      onChange={(e) => setSelectedDate(e.target.value)}
                    />
                  </div>
                </div>

                <div className="space-y-3">
                  <Label className={`text-sm font-semibold ${isDark ? 'text-zinc-300' : 'text-slate-700'}`}>Horários Disponíveis</Label>
                  {loadingSlots ? (
                    <div className="flex justify-center py-8">
                      <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                    </div>
                  ) : availableSlots.length === 0 ? (
                    <div className={`border border-dashed rounded-2xl py-8 text-center ${isDark ? 'border-zinc-800 bg-zinc-900/5' : 'border-slate-300 bg-slate-50'}`}>
                      <p className={`text-sm italic ${isDark ? 'text-zinc-500' : 'text-slate-400'}`}>Nenhum horário disponível para este dia.</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                      {availableSlots.map((slot) => (
                        <button
                          key={slot}
                          type="button"
                          onClick={() => setSelectedSlot(slot)}
                          className={`py-3 px-4 rounded-xl border text-sm font-bold transition duration-300 shadow-sm ${
                            isDark
                              ? 'border-zinc-800 bg-zinc-900/20 hover:bg-primary/10 hover:border-primary text-zinc-300 hover:text-white'
                              : 'border-slate-200 bg-white hover:bg-primary/10 hover:border-primary text-slate-700 hover:text-primary'
                          }`}
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
              <div className={`flex items-center justify-between border-b pb-4 ${isDark ? 'border-zinc-800/80' : 'border-slate-200'}`}>
                <div>
                  <h3 className={`text-xl font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>Insira seus dados</h3>
                  <p className={`text-xs mt-0.5 ${isDark ? 'text-zinc-400' : 'text-slate-500'}`}>Preencha as informações para confirmar o agendamento.</p>
                </div>
                <Button variant="ghost" className={`text-xs border rounded-lg px-3 py-1.5 ${isDark ? 'text-zinc-400 hover:text-white border-zinc-800 hover:bg-zinc-900' : 'text-slate-600 hover:text-slate-900 border-slate-300 hover:bg-slate-100'}`} onClick={() => setSelectedSlot(null)}>Voltar</Button>
              </div>

              <form onSubmit={handleConfirmBooking} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="clientName" className={`text-sm ${isDark ? 'text-zinc-300' : 'text-slate-700'}`}>Seu Nome Completo *</Label>
                  <Input 
                    id="clientName"
                    className={`rounded-xl py-5 ${isDark ? 'bg-zinc-900/60 border-zinc-800 text-white placeholder:text-zinc-500' : 'bg-slate-50 border-slate-300 text-slate-900 focus:bg-white'}`}
                    value={clientName}
                    onChange={(e) => setClientName(e.target.value)}
                    placeholder="Ex: João Silva"
                    required
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="clientPhone" className={`text-sm ${isDark ? 'text-zinc-300' : 'text-slate-700'}`}>WhatsApp / Telefone *</Label>
                    <Input 
                      id="clientPhone"
                      className={`rounded-xl py-5 ${isDark ? 'bg-zinc-900/60 border-zinc-800 text-white placeholder:text-zinc-500' : 'bg-slate-50 border-slate-300 text-slate-900 focus:bg-white'}`}
                      value={clientPhone}
                      onChange={(e) => setClientPhone(e.target.value)}
                      placeholder="Ex: 11999999999"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="clientEmail" className={`text-sm ${isDark ? 'text-zinc-300' : 'text-slate-700'}`}>E-mail (opcional)</Label>
                    <Input 
                      id="clientEmail"
                      type="email"
                      className={`rounded-xl py-5 ${isDark ? 'bg-zinc-900/60 border-zinc-800 text-white placeholder:text-zinc-500' : 'bg-slate-50 border-slate-300 text-slate-900 focus:bg-white'}`}
                      value={clientEmail}
                      onChange={(e) => setClientEmail(e.target.value)}
                      placeholder="Ex: joao@gmail.com"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="clientNotes" className={`text-sm ${isDark ? 'text-zinc-300' : 'text-slate-700'}`}>Observações (opcional)</Label>
                  <Input 
                    id="clientNotes"
                    className={`rounded-xl py-5 ${isDark ? 'bg-zinc-900/60 border-zinc-800 text-white placeholder:text-zinc-500' : 'bg-slate-50 border-slate-300 text-slate-900 focus:bg-white'}`}
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
