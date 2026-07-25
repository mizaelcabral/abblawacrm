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
 * Helper to fetch contact details AND aggregate custom fields from relational contact_custom_values
 */
export async function getContactWithCustomFields(
  accountId: string,
  contactId: string
): Promise<ContactWithCustomFields | null> {
  const admin = supabaseAdmin();

  // 1. Fetch Contact row
  const { data: contact, error: cErr } = await admin
    .from('contacts')
    .select('id, name, email, phone, company, account_id, custom_fields')
    .eq('id', contactId)
    .eq('account_id', accountId)
    .maybeSingle();

  if (cErr || !contact) {
    return null;
  }

  // 2. Fetch custom field definitions and values for this contact
  const [fieldsRes, valuesRes] = await Promise.all([
    admin
      .from('custom_fields')
      .select('id, field_key, field_name')
      .eq('account_id', accountId)
      .eq('is_active', true),
    admin
      .from('contact_custom_values')
      .select('custom_field_id, value')
      .eq('contact_id', contactId),
  ]);

  const fieldsMap = new Map<string, string>(); // custom_field_id -> field_key
  (fieldsRes.data || []).forEach((f) => {
    if (f.field_key) {
      fieldsMap.set(f.id, f.field_key);
    }
  });

  const mergedCustomFields: Record<string, any> = {
    ...(typeof contact.custom_fields === 'object' && contact.custom_fields !== null
      ? contact.custom_fields
      : {}),
  };

  (valuesRes.data || []).forEach((row) => {
    const key = fieldsMap.get(row.custom_field_id);
    if (key && row.value !== undefined && row.value !== null) {
      let val: any = row.value;
      if (val === 'true') val = true;
      else if (val === 'false') val = false;
      mergedCustomFields[key] = val;
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
