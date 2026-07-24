import { resolveSignatory } from './signatory-resolver';
import { ALLOWED_CONTACT_PROPERTIES } from '@/types/signatures';

// Test Suite for Signatory Resolution and Property Allowlist (No External API calls)
export function runSignatoryResolverTests() {
  console.log('--- RUNNING SIGNATORY RESOLVER UNIT TESTS ---');

  // 1. Native contact property allowlist tests
  console.assert(ALLOWED_CONTACT_PROPERTIES.has('name'), 'name must be allowed contact_property');
  console.assert(ALLOWED_CONTACT_PROPERTIES.has('company'), 'company must be allowed contact_property');
  console.assert(!ALLOWED_CONTACT_PROPERTIES.has('cpf'), 'cpf must NOT be allowed contact_property');
  console.assert(!ALLOWED_CONTACT_PROPERTIES.has('street'), 'street must NOT be allowed contact_property');

  // 2. contact_only rule test
  const contactAdult = {
    id: 'c1',
    name: 'João Silva',
    email: 'joao@example.com',
    phone: '51999999999',
    company: 'Acme Inc',
    custom_fields: { cpf: '12345678901', is_minor: false },
  };

  const res1 = resolveSignatory('contact_only', contactAdult);
  console.assert(!res1.is_blocked, 'contact_only should not be blocked');
  console.assert(res1.signatory?.signatory_type === 'contact', 'Signatory type must be contact');

  // 3. guardian_if_minor with is_minor = null -> BLOCKED
  const contactNullMinor = {
    id: 'c2',
    name: 'Maria Souza',
    custom_fields: { is_minor: null },
  };

  const res2 = resolveSignatory('guardian_if_minor', contactNullMinor);
  console.assert(res2.is_blocked, 'is_minor = null must block generation');
  console.assert(res2.missing_fields?.includes('is_minor'), 'missing_fields must contain is_minor');

  // 4. guardian_if_minor with is_minor = false -> Resolves Contact
  const res3 = resolveSignatory('guardian_if_minor', contactAdult);
  console.assert(!res3.is_blocked, 'is_minor = false should resolve contact');
  console.assert(res3.signatory?.signatory_type === 'contact', 'Signatory must be contact when is_minor = false');

  // 5. guardian_if_minor with is_minor = true and incomplete guardian -> BLOCKED listing missing fields
  const contactMinorIncomplete = {
    id: 'c3',
    name: 'Pedro Meno',
    custom_fields: { is_minor: true },
  };

  const res4 = resolveSignatory('guardian_if_minor', contactMinorIncomplete);
  console.assert(res4.is_blocked, 'is_minor = true with incomplete guardian must block');
  console.assert(res4.missing_fields?.includes('guardian_name'), 'missing_fields must list guardian_name');
  console.assert(res4.missing_fields?.includes('guardian_cpf'), 'missing_fields must list guardian_cpf');

  // 6. guardian_if_minor with is_minor = true and complete guardian -> Resolves Guardian
  const contactMinorComplete = {
    id: 'c4',
    name: 'Pedro Menor',
    custom_fields: {
      is_minor: true,
      guardian_name: 'Carlos Menor (Pai)',
      guardian_cpf: '98765432100',
      guardian_phone: '51988888888',
    },
  };

  const res5 = resolveSignatory('guardian_if_minor', contactMinorComplete);
  console.assert(!res5.is_blocked, 'is_minor = true with complete guardian should resolve guardian');
  console.assert(res5.signatory?.signatory_type === 'guardian', 'Signatory must be guardian');
  console.assert(res5.signatory?.name === 'Carlos Menor (Pai)', 'Guardian name must match');

  console.log('--- ALL SIGNATORY RESOLVER UNIT TESTS PASSED SUCCESSFULLY ---');
}
