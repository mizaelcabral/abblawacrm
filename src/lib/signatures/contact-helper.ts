import { supabaseAdmin } from '@/lib/automations/admin-client';

export interface ContactWithCustomFields {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  company: string | null;
  account_id: string;
  custom_fields: Record<string, any>;
}

/**
 * Normalizes any date string (ISO timestamp, DD/MM/YYYY, YYYY-MM-DD, or raw string)
 * into a canonical YYYY-MM-DD date string for input[type="date"] and template variables.
 */
export function normalizeDateToYMD(val?: string | null): string {
  if (!val) return '';
  const trimmed = String(val).trim();
  if (!trimmed) return '';

  // 1. Already strictly YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return trimmed;
  }

  // 2. ISO timestamp string (e.g. 2015-01-01T00:00:00.000Z or 2015-01-01 00:00:00)
  if (trimmed.includes('T') || trimmed.includes(' ')) {
    const parts = trimmed.split(/[T ]/);
    const datePart = parts[0];
    if (/^\d{4}-\d{2}-\d{2}$/.test(datePart)) {
      return datePart;
    }
  }

  // 3. Brazilian DD/MM/YYYY format
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(trimmed)) {
    const [d, m, y] = trimmed.split('/');
    return `${y}-${m}-${d}`;
  }

  // 4. Fallback to JS Date object parsing
  const parsed = new Date(trimmed);
  if (!isNaN(parsed.getTime())) {
    try {
      return parsed.toISOString().split('T')[0];
    } catch {
      return trimmed;
    }
  }

  return trimmed;
}

/**
 * Helper to fetch contact details AND aggregate custom fields from relational contact_custom_values.
 * NOTE: The public.contacts table does NOT have a custom_fields column. Custom field values are
 * stored exclusively in public.contact_custom_values linked to public.custom_fields.
 */
export async function getContactWithCustomFields(
  accountId: string,
  contactId: string
): Promise<ContactWithCustomFields | null> {
  const admin = supabaseAdmin();

  // 1. Fetch Contact row (selecting ONLY existing columns: id, name, email, phone, company, account_id)
  const { data: contact, error: cErr } = await admin
    .from('contacts')
    .select('id, name, email, phone, company, account_id')
    .eq('id', contactId)
    .eq('account_id', accountId)
    .maybeSingle();

  if (cErr || !contact) {
    if (cErr) {
      console.error('[getContactWithCustomFields] Contact fetch DB error:', cErr.message);
    }
    return null;
  }

  // 2. Fetch active custom field definitions for the account
  const { data: fieldsRes, error: fErr } = await admin
    .from('custom_fields')
    .select('id, field_key, field_name, field_type')
    .eq('account_id', accountId)
    .eq('is_active', true);

  if (fErr) {
    console.error('[getContactWithCustomFields] custom_fields fetch error:', fErr.message);
  }

  // 3. Fetch custom field values for this contact
  const { data: valuesRes, error: vErr } = await admin
    .from('contact_custom_values')
    .select('custom_field_id, value')
    .eq('contact_id', contactId);

  if (vErr) {
    console.error('[getContactWithCustomFields] contact_custom_values fetch error:', vErr.message);
  }

  const fieldsMap = new Map<string, { key: string; type: string }>(); // custom_field_id -> { key, type }
  (fieldsRes || []).forEach((f) => {
    if (f.field_key) {
      fieldsMap.set(f.id, { key: f.field_key, type: f.field_type });
    }
  });

  const mergedCustomFields: Record<string, any> = {};

  (valuesRes || []).forEach((row) => {
    const fieldDef = fieldsMap.get(row.custom_field_id);
    if (fieldDef && fieldDef.key && row.value !== undefined && row.value !== null) {
      let val: any = row.value;
      if (val === 'true') val = true;
      else if (val === 'false') val = false;
      else if (fieldDef.type === 'date' || fieldDef.key === 'birth_date') {
        val = normalizeDateToYMD(String(val));
      }
      mergedCustomFields[fieldDef.key] = val;
    }
  });

  return {
    id: contact.id,
    name: contact.name || '',
    email: contact.email || null,
    phone: contact.phone || null,
    company: contact.company || null,
    account_id: contact.account_id,
    custom_fields: mergedCustomFields,
  };
}
