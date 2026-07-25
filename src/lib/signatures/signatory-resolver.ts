import { SignatoryRule } from '@/types/signatures';

export interface ResolvedSignatory {
  signatory_type: 'contact' | 'guardian';
  name: string;
  email?: string;
  phone?: string;
  cpf?: string;
  rg?: string;
  relationship?: string;
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
 * MANDATORY: When is_minor = true, ALL 5 guardian fields must be present:
 * - guardian_name
 * - guardian_cpf
 * - guardian_phone
 * - guardian_email
 * - guardian_relationship (e.g., "Pai", "Mãe", "Tutor Legal")
 * STRICT: Absolutely ZERO automatic fallback from missing guardian fields to patient data.
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
        rg: custom.rg ? String(custom.rg) : undefined,
      },
    };
  }

  if (rule === 'guardian_if_minor') {
    const isMinorRaw = custom.is_minor;

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
          rg: custom.rg ? String(custom.rg) : undefined,
        },
      };
    }

    // Patient is minor (is_minor === true) -> Require ALL 5 Guardian custom_fields (NO fallback!)
    const missingGuardianFields: string[] = [];
    if (!custom.guardian_name || !String(custom.guardian_name).trim()) missingGuardianFields.push('guardian_name');
    if (!custom.guardian_cpf || !String(custom.guardian_cpf).trim()) missingGuardianFields.push('guardian_cpf');
    if (!custom.guardian_phone || !String(custom.guardian_phone).trim()) missingGuardianFields.push('guardian_phone');
    if (!custom.guardian_email || !String(custom.guardian_email).trim()) missingGuardianFields.push('guardian_email');
    if (!custom.guardian_relationship || !String(custom.guardian_relationship).trim()) missingGuardianFields.push('guardian_relationship');

    if (missingGuardianFields.length > 0) {
      return {
        is_blocked: true,
        block_reason: 'Paciente menor de idade exige o preenchimento completo dos dados do responsável legal (nome, CPF, telefone, e-mail e vínculo/parentesco).',
        missing_fields: missingGuardianFields,
      };
    }

    return {
      is_blocked: false,
      signatory: {
        signatory_type: 'guardian',
        name: String(custom.guardian_name).trim(),
        email: String(custom.guardian_email).trim(),
        phone: String(custom.guardian_phone).trim(),
        cpf: String(custom.guardian_cpf).trim(),
        rg: custom.guardian_rg ? String(custom.guardian_rg) : undefined,
        relationship: String(custom.guardian_relationship).trim(),
      },
    };
  }

  if (rule === 'guardian_only') {
    const missingGuardianFields: string[] = [];
    if (!custom.guardian_name || !String(custom.guardian_name).trim()) missingGuardianFields.push('guardian_name');
    if (!custom.guardian_cpf || !String(custom.guardian_cpf).trim()) missingGuardianFields.push('guardian_cpf');
    if (!custom.guardian_phone || !String(custom.guardian_phone).trim()) missingGuardianFields.push('guardian_phone');
    if (!custom.guardian_email || !String(custom.guardian_email).trim()) missingGuardianFields.push('guardian_email');
    if (!custom.guardian_relationship || !String(custom.guardian_relationship).trim()) missingGuardianFields.push('guardian_relationship');

    if (missingGuardianFields.length > 0) {
      return {
        is_blocked: true,
        block_reason: 'O modelo exige obrigatoriamente os dados completos do responsável legal.',
        missing_fields: missingGuardianFields,
      };
    }

    return {
      is_blocked: false,
      signatory: {
        signatory_type: 'guardian',
        name: String(custom.guardian_name).trim(),
        email: String(custom.guardian_email).trim(),
        phone: String(custom.guardian_phone).trim(),
        cpf: String(custom.guardian_cpf).trim(),
        rg: custom.guardian_rg ? String(custom.guardian_rg) : undefined,
        relationship: String(custom.guardian_relationship).trim(),
      },
    };
  }

  return {
    is_blocked: true,
    block_reason: 'Regra de signatário não reconhecida.',
  };
}
