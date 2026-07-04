'use client';

import { useEffect, useState, useCallback } from 'react';
import { Loader2, RefreshCw, Search } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { SettingsPanelHead } from './settings-panel-head';

interface AuditLog {
  id: string;
  created_at: string;
  user_email: string | null;
  action: string;
  target_type: string | null;
  target_id: string | null;
  details: Record<string, any> | null;
}

export function AuditPanel() {
  const { profile } = useAuth();
  const supabase = createClient();
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const fetchLogs = useCallback(async () => {
    if (!profile?.account_id) return;
    
    let query = supabase
      .from('audit_logs')
      .select('*')
      .eq('account_id', profile.account_id)
      .order('created_at', { ascending: false });

    const { data, error } = await query;

    if (error) {
      console.error('[AuditPanel] Error fetching logs:', error);
    } else {
      setLogs(data || []);
    }
    setLoading(false);
    setRefreshing(false);
  }, [supabase, profile]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchLogs();
  };

  const getActionLabel = (action: string) => {
    switch (action) {
      case 'contact.create':
        return 'Contato criado';
      case 'contact.update':
        return 'Contato editado';
      case 'contact.delete':
        return 'Contato excluído';
      case 'contact.export':
        return 'Contatos exportados';
      case 'settings.revoke_consent':
        return 'Consentimento revogado';
      default:
        return action;
    }
  };

  const getActionBadgeColor = (action: string) => {
    switch (action) {
      case 'contact.create':
        return 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20';
      case 'contact.delete':
        return 'bg-red-500/10 text-red-400 border border-red-500/20';
      case 'contact.export':
        return 'bg-blue-500/10 text-blue-400 border border-blue-500/20';
      case 'contact.update':
        return 'bg-amber-500/10 text-amber-400 border border-amber-500/20';
      default:
        return 'bg-muted text-muted-foreground border border-border';
    }
  };

  const renderDetails = (log: AuditLog) => {
    const details = log.details;
    if (!details) return '-';

    if (log.action === 'contact.export') {
      return `Total de contatos exportados: ${details.count || 0}`;
    }

    if (log.action === 'contact.create' || log.action === 'contact.delete') {
      return (
        <span className="text-xs text-muted-foreground font-mono">
          {details.name && `Nome: ${details.name}`}
          {details.phone && ` | Tel: ${details.phone}`}
          {details.email && ` | E-mail: ${details.email}`}
        </span>
      );
    }

    if (log.action === 'contact.update') {
      const oldVal = details.old || {};
      const newVal = details.new || {};
      const changed: string[] = [];

      Object.keys(newVal).forEach((key) => {
        if (oldVal[key] !== newVal[key]) {
          changed.push(
            `${key === 'name' ? 'Nome' : key === 'phone' ? 'Telefone' : key === 'email' ? 'E-mail' : key}: "${oldVal[key] || ''}" ➔ "${newVal[key] || ''}"`
          );
        }
      });

      return (
        <div className="text-xs text-muted-foreground space-y-0.5">
          {changed.map((change, idx) => (
            <div key={idx} className="font-mono">{change}</div>
          ))}
          {changed.length === 0 && <span className="italic">Nenhuma informação pessoal alterada</span>}
        </div>
      );
    }

    return (
      <span className="text-xs text-muted-foreground font-mono">
        {JSON.stringify(details)}
      </span>
    );
  };

  const filteredLogs = logs.filter((log) => {
    const term = search.toLowerCase();
    const userMatch = log.user_email?.toLowerCase().includes(term);
    const actionMatch = log.action.toLowerCase().includes(term);
    const labelMatch = getActionLabel(log.action).toLowerCase().includes(term);
    return userMatch || actionMatch || labelMatch;
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <SettingsPanelHead
          title="Registro de Auditoria (LGPD)"
          description="Log completo de acessos, exportações e modificações de dados pessoais dos titulares de dados no seu espaço de trabalho."
        />
        <Button
          variant="outline"
          size="sm"
          onClick={handleRefresh}
          disabled={loading || refreshing}
          className="border-border text-muted-foreground hover:bg-muted"
        >
          {refreshing ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
          <span className="ml-2 hidden sm:inline">Atualizar</span>
        </Button>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
        <Input
          placeholder="Buscar por e-mail ou ação..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9 border-border bg-muted text-foreground placeholder:text-muted-foreground focus-visible:border-primary focus-visible:ring-primary/20"
        />
      </div>

      {loading ? (
        <div className="flex h-40 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : filteredLogs.length === 0 ? (
        <div className="text-center py-12 border border-dashed border-border rounded-lg text-muted-foreground text-sm">
          Nenhum log de auditoria encontrado.
        </div>
      ) : (
        <div className="border border-border rounded-lg overflow-hidden bg-card">
          <Table>
            <TableHeader className="bg-muted/40">
              <TableRow className="border-border hover:bg-transparent">
                <TableHead className="text-muted-foreground w-[180px]">Data e Hora</TableHead>
                <TableHead className="text-muted-foreground w-[220px]">Operador</TableHead>
                <TableHead className="text-muted-foreground w-[160px]">Ação</TableHead>
                <TableHead className="text-muted-foreground">Detalhes das Alterações / Portabilidade</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredLogs.map((log) => (
                <TableRow key={log.id} className="border-border hover:bg-muted/20">
                  <TableCell className="text-sm text-foreground font-medium">
                    {new Date(log.created_at).toLocaleString('pt-BR', {
                      dateStyle: 'short',
                      timeStyle: 'medium',
                    })}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground font-mono truncate">
                    {log.user_email || 'Sistema / API'}
                  </TableCell>
                  <TableCell className="text-sm">
                    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${getActionBadgeColor(log.action)}`}>
                      {getActionLabel(log.action)}
                    </span>
                  </TableCell>
                  <TableCell className="text-sm">
                    {renderDetails(log)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
