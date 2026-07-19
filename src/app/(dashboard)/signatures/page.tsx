'use client';

import { useEffect, useState, useCallback } from 'react';
import { 
  FileText, 
  CheckCircle2, 
  Clock, 
  XCircle, 
  Search, 
  ExternalLink, 
  Loader2,
  RefreshCw,
  Calendar,
  PenTool
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/hooks/use-auth';
import { MetricCard } from '@/components/dashboard/metric-card';
import { toast } from 'sonner';

type SignatureStatus = 'all' | 'pending' | 'signed' | 'refused' | 'expired' | 'cancelled';

interface SignatureDocument {
  id: string;
  doc_token: string;
  doc_name: string;
  status: 'pending' | 'signed' | 'refused' | 'expired' | 'cancelled';
  signer_name: string;
  signer_email: string | null;
  signer_phone: string | null;
  sign_url: string | null;
  signed_at: string | null;
  created_at: string;
  contact?: {
    id: string;
    name: string;
    phone: string;
    email: string;
  } | null;
}

interface Metrics {
  total: number;
  pending: number;
  signed: number;
  failed: number;
}

export default function SignaturesPage() {
  const { accountId } = useAuth();
  const [documents, setDocuments] = useState<SignatureDocument[]>([]);
  const [metrics, setMetrics] = useState<Metrics>({ total: 0, pending: 0, signed: 0, failed: 0 });
  
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<SignatureStatus>('all');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  // Debounce search input
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(search);
    }, 300);
    return () => clearTimeout(handler);
  }, [search]);

  const loadDocuments = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter !== 'all') params.set('status', statusFilter);
      if (debouncedSearch) params.set('search', debouncedSearch);

      const res = await fetch(`/api/zapsign/documents?${params.toString()}`);
      if (!res.ok) throw new Error('Falha ao carregar assinaturas.');

      const data = await res.json();
      setDocuments(data.documents || []);
      setMetrics(data.metrics || { total: 0, pending: 0, signed: 0, failed: 0 });
    } catch (err) {
      console.error(err);
      toast.error('Erro ao carregar assinaturas.');
    } finally {
      setLoading(false);
    }
  }, [statusFilter, debouncedSearch]);

  useEffect(() => {
    if (accountId) {
      void loadDocuments();
    }
  }, [accountId, loadDocuments]);

  const getStatusBadge = (status: SignatureDocument['status']) => {
    switch (status) {
      case 'signed':
        return (
          <Badge className="bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20 border-emerald-500/20">
            Assinado
          </Badge>
        );
      case 'pending':
        return (
          <Badge className="bg-amber-500/10 text-amber-500 hover:bg-amber-500/20 border-amber-500/20">
            Pendente
          </Badge>
        );
      case 'refused':
        return (
          <Badge className="bg-red-500/10 text-red-500 hover:bg-red-500/20 border-red-500/20">
            Recusado
          </Badge>
        );
      case 'expired':
        return (
          <Badge className="bg-slate-500/10 text-slate-400 hover:bg-slate-500/20 border-slate-500/20">
            Expirado
          </Badge>
        );
      case 'cancelled':
        return (
          <Badge className="bg-slate-500/10 text-slate-400 hover:bg-slate-500/20 border-slate-500/20">
            Cancelado
          </Badge>
        );
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <PenTool className="h-6 w-6 text-primary" /> Painel de Assinaturas
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Acompanhe o status dos documentos jurídicos e assinaturas enviadas pela ZapSign.
          </p>
        </div>
        <Button onClick={loadDocuments} variant="outline" size="sm" className="gap-1">
          <RefreshCw className="h-3.5 w-3.5" /> Atualizar
        </Button>
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          title="Total Enviados"
          value={metrics.total.toString()}
          icon={FileText}
        />
        <MetricCard
          title="Aguardando Assinatura"
          value={metrics.pending.toString()}
          icon={Clock}
        />
        <MetricCard
          title="Documentos Assinados"
          value={metrics.signed.toString()}
          icon={CheckCircle2}
        />
        <MetricCard
          title="Falhas / Cancelados"
          value={metrics.failed.toString()}
          icon={XCircle}
        />
      </div>

      {/* Controls */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        {/* Search */}
        <div className="relative max-w-sm flex-1">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por documento ou signatário..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 bg-background border-input"
          />
        </div>

        {/* Filter Buttons */}
        <div className="flex flex-wrap gap-2">
          {(['all', 'pending', 'signed', 'refused'] as const).map((status) => (
            <Button
              key={status}
              variant={statusFilter === status ? 'default' : 'outline'}
              size="sm"
              onClick={() => setStatusFilter(status)}
              className="text-xs"
            >
              {status === 'all' && 'Todos'}
              {status === 'pending' && 'Pendentes'}
              {status === 'signed' && 'Assinados'}
              {status === 'refused' && 'Recusados'}
            </Button>
          ))}
        </div>
      </div>

      {/* Table */}
      <Card className="border-border bg-card">
        <CardContent className="p-0">
          {loading ? (
            <div className="flex h-64 items-center justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : documents.length === 0 ? (
            <div className="flex h-64 flex-col items-center justify-center text-center p-6">
              <FileText className="h-10 w-10 text-muted-foreground mb-2" />
              <h3 className="text-sm font-semibold text-foreground">Nenhuma assinatura encontrada</h3>
              <p className="text-xs text-muted-foreground mt-1 max-w-xs">
                Não encontramos documentos com os filtros aplicados. Crie assinaturas no chat.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/40 text-muted-foreground font-medium text-xs uppercase tracking-wider">
                    <th className="p-4">Documento</th>
                    <th className="p-4">Signatário</th>
                    <th className="p-4">Status</th>
                    <th className="p-4">Enviado em</th>
                    <th className="p-4">Assinado em</th>
                    <th className="p-4 text-right">Ação</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {documents.map((doc) => (
                    <tr key={doc.id} className="hover:bg-muted/30 transition-colors">
                      <td className="p-4 font-medium text-foreground max-w-[200px] truncate">
                        {doc.doc_name}
                      </td>
                      <td className="p-4">
                        <div className="font-medium text-foreground">{doc.signer_name}</div>
                        <div className="text-xs text-muted-foreground">
                          {doc.signer_phone || doc.signer_email}
                        </div>
                      </td>
                      <td className="p-4">{getStatusBadge(doc.status)}</td>
                      <td className="p-4 text-muted-foreground">{formatDate(doc.created_at)}</td>
                      <td className="p-4 text-muted-foreground">{formatDate(doc.signed_at)}</td>
                      <td className="p-4 text-right">
                        {doc.sign_url && (
                          <a
                            href={doc.sign_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-xs text-primary hover:underline hover:text-primary/80 font-medium"
                          >
                            Ver Documento <ExternalLink className="h-3 w-3" />
                          </a>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
