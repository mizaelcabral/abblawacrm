import { ALLOWED_SYSTEM_VALUES } from '@/types/signatures';

const MONTH_NAMES_PTBR = [
  'janeiro',
  'fevereiro',
  'março',
  'abril',
  'maio',
  'junho',
  'julho',
  'agosto',
  'setembro',
  'outubro',
  'novembro',
  'dezembro',
];

export interface SystemValueResult {
  is_blocked: boolean;
  value?: string;
  block_reason?: string;
}

export function formatPtBrCurrentDate(date: Date = new Date()): string {
  const day = date.getDate();
  const month = MONTH_NAMES_PTBR[date.getMonth()];
  const year = date.getFullYear();
  return `${day} de ${month} de ${year}`;
}

export function resolveSystemValue(
  sourceKey: string,
  contactCustomFields: Record<string, any> = {}
): SystemValueResult {
  if (!ALLOWED_SYSTEM_VALUES.has(sourceKey)) {
    return {
      is_blocked: true,
      block_reason: `System value '${sourceKey}' não reconhecido.`,
    };
  }

  if (sourceKey === 'contact_city_current_date_ptbr') {
    const city = contactCustomFields.city || contactCustomFields.cidade;
    if (!city || typeof city !== 'string' || !city.trim()) {
      return {
        is_blocked: true,
        block_reason: 'A cidade do contato (custom_field.city) é obrigatória para compor Local e data.',
      };
    }

    const formattedDate = formatPtBrCurrentDate();
    return {
      is_blocked: false,
      value: `${city.trim()}, ${formattedDate}`,
    };
  }

  return {
    is_blocked: true,
    block_reason: 'Regra de system_value não configurada.',
  };
}
