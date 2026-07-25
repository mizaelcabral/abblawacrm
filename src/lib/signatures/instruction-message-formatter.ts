export interface FormatInstructionMessageParams {
  templateText?: string | null;
  firstName: string;
  signingLink: string;
  privacyNoticeUrl?: string | null;
}

export const DEFAULT_INSTRUCTION_MESSAGE_TEMPLATE =
  `Olá, {first_name}. Sua procuração está pronta para conferência e assinatura.\n\n` +
  `Se o paciente tiver 18 anos ou mais, a assinatura deve ser realizada pelo próprio paciente. Se for menor de idade ou incapaz, a assinatura deve ser realizada pelo responsável legal cadastrado.\n\n` +
  `Antes de assinar, confira atentamente os dados apresentados no documento.\n\n` +
  `Link exclusivo para assinatura: {signing_link}\n\n` +
  `Por segurança, não encaminhe este link a terceiros. Em caso de dúvida ou dado incorreto, não assine e entre em contato conosco.`;

export const ALLOWED_PLACEHOLDERS = new Set(['{first_name}', '{signing_link}', '{privacy_notice_url}']);

export function formatInstructionMessage(params: FormatInstructionMessageParams): {
  success: boolean;
  message?: string;
  error?: string;
} {
  const rawTemplate = params.templateText?.trim() || DEFAULT_INSTRUCTION_MESSAGE_TEMPLATE;

  // Validate placeholders
  const foundPlaceholders = rawTemplate.match(/\{[^}]+\}/g) || [];
  for (const ph of foundPlaceholders) {
    if (!ALLOWED_PLACEHOLDERS.has(ph)) {
      return {
        success: false,
        error: `Placeholder não permitido encontrado no modelo de mensagem: '${ph}'. Permitidos: {first_name}, {signing_link}, {privacy_notice_url}`,
      };
    }
  }

  // Check privacy notice URL if provided
  let privacyNotice = params.privacyNoticeUrl || '';
  if (privacyNotice && !privacyNotice.startsWith('https://')) {
    return {
      success: false,
      error: 'A URL do aviso de privacidade (privacy_notice_url) deve utilizar HTTPS.',
    };
  }

  // Replace placeholders safely
  let formatted = rawTemplate
    .replace(/\{first_name\}/g, params.firstName.trim())
    .replace(/\{signing_link\}/g, params.signingLink.trim())
    .replace(/\{privacy_notice_url\}/g, privacyNotice);

  // Sanitize any accidental HTML
  formatted = formatted.replace(/<[^>]*>/g, '');

  return {
    success: true,
    message: formatted,
  };
}
