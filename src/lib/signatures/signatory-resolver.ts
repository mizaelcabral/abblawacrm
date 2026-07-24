import { SignatoryRule } from '@/types/signatures';

export interface ResolvedSignatory {
  signatory_type: 'contact' | 'guardian';
  name: string;
  email?: string;
  phone?: string;
  cpf?: string;
}

export interface SignatoryResolutionResult {
  is_blocked: boolean;
  signatory?: ResolvedSignatory;
  missing_fields?: string[];
  block_reason?: string;
}

export interface ContactForSignatoryResolution {
  id: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  company?: string | null;
  custom_fields?: Record<string, any> | null;
}

/**
 * Resolves the signatory (contact vs guardian) according to template rules and minor status (is_minor).
 * All guardian fields and is_minor are resolved exclusively from custom_fields JSON!
 */
export function resolveSignatory(
  rule: SignatoryRule,
  contact: ContactForSignatoryResolution
): SignatoryResolutionResult {
  const custom = contact.custom_fields || {};

  if (rule === 'contact_only') {
    return {
      is_blocked: false,
      signatory: {
        signatory_type: 'contact',
        name: contact.name,
        email: contact.email || undefined,
        phone: contact.phone || undefined,
        cpf: custom.cpf ? String(custom.cpf) : undefined,
      },
    };
  }

  if (rule === 'guardian_if_minor') {
    const isMinorRaw = custom.is_minor;

    // Strict boolean check: null, undefined, or non-boolean strings must block generation
    let isMinor: boolean | null = null;
    if (typeof isMinorRaw === 'boolean') {
      isMinor = isMinorRaw;
    } else if (typeof isMinorRaw === 'string') {
      if (isMinorRaw.toLowerCase() === 'true') isMinor = true;
      if (isMinorRaw.toLowerCase() === 'false') isMinor = false;
    }

    if (isMinor === null) {
      return {
        is_blocked: true,
        block_reason: 'O campo de identificação de menor de idade (is_minor) não foi preenchido ou é inválido no contato.',
        missing_fields: ['is_minor'],
      };
    }

    if (isMinor === false) {
      return {
        is_blocked: false,
        signatory: {
          signatory_type: 'contact',
          name: contact.name,
          email: contact.email || undefined,
          phone: contact.phone || undefined,
          cpf: custom.cpf ? String(custom.cpf) : undefined,
        },
      };
    }

    // Patient is minor (is_minor === true) -> Require Guardian custom_fields
    const missingGuardianFields: string[] = [];
    if (!custom.guardian_name) missingGuardianFields.push('guardian_name');
    if (!custom.guardian_cpf) missingGuardianFields.push('guardian_cpf');

    if (missingGuardianFields.length > 0) {
      return {
        is_blocked: true,
        block_reason: 'Paciente menor de idade exige o preenchimento dos dados do responsável legal.',
        missing_fields: missingGuardianFields,
      };
    }

    return {
      is_blocked: false,
      signatory: {
        signatory_type: 'guardian',
        name: String(custom.guardian_name),
        email: custom.guardian_email ? String(custom.guardian_email) : (contact.email || undefined),
        phone: custom.guardian_phone ? String(custom.guardian_phone) : (contact.phone || undefined),
        cpf: String(custom.guardian_cpf),
      },
    };
  }

  if (rule === 'guardian_only') {
    const missingGuardianFields: string[] = [];
    if (!custom.guardian_name) missingGuardianFields.push('guardian_name');
    if (!custom.guardian_cpf) missingGuardianFields.push('guardian_cpf');

    if (missingGuardianFields.length > 0) {
      return {
        is_blocked: true,
        block_reason: 'O modelo exige obrigatoriamente os dados do responsável legal.',
        missing_fields: missingGuardianFields,
      };
    }

    return {
      is_blocked: false,
      signatory: {
        signatory_type: 'guardian',
        name: String(custom.guardian_name),
        email: custom.guardian_email ? String(custom.guardian_email) : (contact.email || undefined),
        phone: custom.guardian_phone ? String(custom.guardian_phone) : (contact.phone || undefined),
        cpf: String(custom.guardian_cpf),
      },
    };
  }

  return {
    is_blocked: true,
    block_reason: 'Regra de signatário não reconhecida.',
  };
}
