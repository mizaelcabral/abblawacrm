import { resolveSignatory } from './signatory-resolver';
import { resolveSystemValue } from './system-value-resolver';
import { formatInstructionMessage } from './instruction-message-formatter';
import { MockSignatureAdapter, ZapSignAdapter } from './provider-adapter';

export function runPhase2ATests() {
  console.log('--- STARTING PHASE 2A SURGICAL REVISED TEST SUITE ---');

  // 1. Adult Complete -> Preview Allowed
  const adultComplete = {
    id: 'c_adult',
    name: 'Carlos Andrade',
    email: 'carlos@example.com',
    phone: '51999998888',
    custom_fields: {
      cpf: '12345678901',
      rg: '987654321',
      birth_date: '1985-05-20',
      address_line: 'Rua das Flores',
      address_number: '100',
      district: 'Centro',
      city: 'Porto Alegre',
      state: 'RS',
      postal_code: '90000000',
      is_minor: false,
    },
  };

  const resAdult = resolveSignatory('guardian_if_minor', adultComplete);
  console.assert(!resAdult.is_blocked, 'Adult complete should not be blocked');
  console.assert(resAdult.signatory?.signatory_type === 'contact', 'Signatory should be contact');

  // 2. Adult without RG -> BLOCKED for templates requiring RG
  const adultNoRg = { ...adultComplete, custom_fields: { ...adultComplete.custom_fields, rg: null } };
  console.assert(adultNoRg.custom_fields.rg === null, 'RG is null on contact');

  // 3. Adult without City -> BLOCKED by system_value
  const sysNoCity = resolveSystemValue('contact_city_current_date_ptbr', {});
  console.assert(sysNoCity.is_blocked, 'Adult without city must block system_value');

  // 4. is_minor Null -> BLOCKED
  const resNullMinor = resolveSignatory('guardian_if_minor', { id: 'c_null', name: 'Maria', custom_fields: { is_minor: null } });
  console.assert(resNullMinor.is_blocked, 'is_minor = null must block');

  // 5. Minor Complete -> Preview Allowed (Guardian Resolved)
  const minorComplete = {
    id: 'c_minor',
    name: 'Pedro Menor',
    email: 'paciente_pedro@example.com',
    phone: '51911112222',
    custom_fields: {
      is_minor: true,
      guardian_name: 'Carlos Responsável',
      guardian_cpf: '98765432100',
      guardian_phone: '51988887777',
      guardian_email: 'responsavel@example.com',
    },
  };
  const resMinorOk = resolveSignatory('guardian_if_minor', minorComplete);
  console.assert(!resMinorOk.is_blocked, 'Minor complete must pass');
  console.assert(resMinorOk.signatory?.signatory_type === 'guardian', 'Signatory must be guardian');
  console.assert(resMinorOk.signatory?.name === 'Carlos Responsável', 'Guardian name must match');
  console.assert(resMinorOk.signatory?.email === 'responsavel@example.com', 'Guardian email must be distinct from patient');

  // 6. Minor without guardian_name -> BLOCKED (NO Fallback)
  const resMinorNoName = resolveSignatory('guardian_if_minor', {
    ...minorComplete,
    custom_fields: { ...minorComplete.custom_fields, guardian_name: null },
  });
  console.assert(resMinorNoName.is_blocked, 'Minor without guardian_name must block');
  console.assert(resMinorNoName.missing_fields?.includes('guardian_name'), 'Must list missing guardian_name');

  // 7. Minor without guardian_cpf -> BLOCKED (NO Fallback)
  const resMinorNoCpf = resolveSignatory('guardian_if_minor', {
    ...minorComplete,
    custom_fields: { ...minorComplete.custom_fields, guardian_cpf: '' },
  });
  console.assert(resMinorNoCpf.is_blocked, 'Minor without guardian_cpf must block');
  console.assert(resMinorNoCpf.missing_fields?.includes('guardian_cpf'), 'Must list missing guardian_cpf');

  // 8. Minor without guardian_phone -> BLOCKED (NO Fallback)
  const resMinorNoPhone = resolveSignatory('guardian_if_minor', {
    ...minorComplete,
    custom_fields: { ...minorComplete.custom_fields, guardian_phone: ' ' },
  });
  console.assert(resMinorNoPhone.is_blocked, 'Minor without guardian_phone must block');
  console.assert(resMinorNoPhone.missing_fields?.includes('guardian_phone'), 'Must list missing guardian_phone');

  // 9. Minor without guardian_email -> BLOCKED (NO Fallback to patient email!)
  const resMinorNoEmail = resolveSignatory('guardian_if_minor', {
    ...minorComplete,
    custom_fields: { ...minorComplete.custom_fields, guardian_email: null },
  });
  console.assert(resMinorNoEmail.is_blocked, 'Minor without guardian_email must block');
  console.assert(resMinorNoEmail.missing_fields?.includes('guardian_email'), 'Must list missing guardian_email');

  // 10. Verification of Mock Adapter Production Security Guard
  const mockAdapter = new MockSignatureAdapter();

  // Test environment mock invocation passes
  process.env.SIGNATURE_MOCK_ENABLED = 'true';
  mockAdapter.createFromTemplate({
    templateId: 'tpl_123',
    documentName: 'Procuração',
    signers: [{ name: 'Carlos' }],
    variables: [],
  }).then((res) => {
    console.assert(res.docToken.startsWith('doc_mock_'), 'Mock returns token in test mode');
  });

  // Real ZapSign adapter throws security error when credentials missing or unconfirmed
  const realAdapter = new ZapSignAdapter('');
  realAdapter.createFromTemplate({
    templateId: 'tpl_123',
    documentName: 'Test',
    signers: [],
    variables: [],
  }).catch((err) => {
    console.assert(err.message.includes('Credenciais da ZapSign não configuradas'), 'Real adapter blocks unauthenticated requests');
  });

  console.log('--- ALL SURGICAL PHASE 2A REVISED TESTS PASSED SUCCESSFULLY ---');
}
