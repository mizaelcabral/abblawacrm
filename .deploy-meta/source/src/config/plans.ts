export interface PlanConfig {
  name: string;
  price: number;
  stripePriceId?: string;
  aiMessageLimit: number;
  allowAutopilot: boolean;
  allowSuggestions: boolean;
  maxAutopilotConversations: number;
  features: string[];
}

export const PLANS: Record<string, PlanConfig> = {
  starter: {
    name: 'Starter',
    price: 97,
    stripePriceId: process.env.NEXT_PUBLIC_STRIPE_PRICE_STARTER,
    aiMessageLimit: 0,
    allowAutopilot: false,
    allowSuggestions: false,
    maxAutopilotConversations: 0,
    features: [
      'Atendentes ilimitados',
      'Contatos ilimitados',
      'Funis de vendas visual',
      'Transmissões (Broadcast)',
      'Suporte a modelos de templates',
      'Sem Inteligência Artificial (IA)',
    ],
  },
  pro: {
    name: 'Pro',
    price: 249,
    stripePriceId: process.env.NEXT_PUBLIC_STRIPE_PRICE_PRO,
    aiMessageLimit: 3000,
    allowAutopilot: true,
    allowSuggestions: true,
    maxAutopilotConversations: 3,
    features: [
      'Todos os recursos do Starter',
      '3.000 mensagens automáticas de IA/mês',
      'Sugestões de Respostas (Copiloto IA)',
      'Piloto Automático em até 3 chats simultâneos',
      'Respostas baseadas na Base de Conhecimento (RAG)',
      'Suporte por email prioritário',
    ],
  },
  scale: {
    name: 'Scale',
    price: 497,
    stripePriceId: process.env.NEXT_PUBLIC_STRIPE_PRICE_SCALE,
    aiMessageLimit: 10000,
    allowAutopilot: true,
    allowSuggestions: true,
    maxAutopilotConversations: 9999,
    features: [
      'Todos os recursos do Pro',
      'Conexão de IAs via MCP (Cursor, Claude, etc.)',
      '10.000 mensagens automáticas de IA/mês',
      'Piloto Automático em chats ilimitados',
      'R$ 0,05 por mensagem adicional excedente',
      'Tempo de resposta ultra-rápido',
      'Suporte via WhatsApp dedicado',
    ],
  },
};

