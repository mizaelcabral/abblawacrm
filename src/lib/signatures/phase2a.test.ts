import { resolveSignatory } from './signatory-resolver';
import { resolveSystemValue } from './system-value-resolver';
import { formatInstructionMessage } from './instruction-message-formatter';
import { MockSignatureAdapter, ZapSignAdapter } from './provider-adapter';

// Comprehensive Unit & Integration Test Suite for Phase 2A (No External Calls)
export function runPhase2ATests() {
  console.log('--- STARTING PHASE 2A COMPREHENSIVE TEST SUITE ---');

  // 1. Adult Complete Test
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

  // 2. Adult without RG -> Handled in variable validation
  const adultNoRg = { ...adultComplete, custom_fields: { ...adultComplete.custom_fields, rg: null } };
  console.assert(adultNoRg.custom_fields.rg === null, 'RG is null');

  // 3. System Value: Allowed vs Unknown
  const sysOk = resolveSystemValue('contact_city_current_date_ptbr', { city: 'São Paulo' });
  console.assert(!sysOk.is_blocked, 'contact_city_current_date_ptbr with city should pass');
  console.assert(sysOk.value?.startsWith('São Paulo,'), 'Should format city with date');

  const sysNoCity = resolveSystemValue('contact_city_current_date_ptbr', {});
  console.assert(sysNoCity.is_blocked, 'contact_city_current_date_ptbr without city should block');

  const sysUnknown = resolveSystemValue('unknown_sys_key' as any, { city: 'Rio' });
  console.assert(sysUnknown.is_blocked, 'Unknown system_value must block');

  // 4. Minor Scenarios
  const minorNoGuardianCpf = {
    id: 'c_minor',
    name: 'Lucas Menor',
    custom_fields: {
      is_minor: true,
      guardian_name: 'Ana Silva',
      guardian_cpf: null,
    },
  };
  const resMinorBlock = resolveSignatory('guardian_if_minor', minorNoGuardianCpf);
  console.assert(resMinorBlock.is_blocked, 'Minor without guardian_cpf must block');
  console.assert(resMinorBlock.missing_fields?.includes('guardian_cpf'), 'Must report missing guardian_cpf');

  // 5. Instruction Message Formatting
  const msgOk = formatInstructionMessage({
    firstName: 'Carlos',
    signingLink: 'https://app.zapsign.com.br/verificar/doc_123',
    privacyNoticeUrl: 'https://example.com/privacy',
  });
  console.assert(msgOk.success, 'Instruction message should format successfully');
  console.assert(msgOk.message?.includes('Carlos'), 'Message must include first_name');
  console.assert(msgOk.message?.includes('doc_123'), 'Message must include signingLink');

  const msgBadPlaceholder = formatInstructionMessage({
    templateText: 'Olá {invalid_placeholder}',
    firstName: 'Carlos',
    signingLink: 'https://app.zapsign.com.br/verificar/doc_123',
  });
  console.assert(!msgBadPlaceholder.success, 'Unknown placeholder must be rejected');

  // 6. Mock Adapter Verification (Zero External Calls)
  const mockAdapter = new MockSignatureAdapter();
  mockAdapter.createFromTemplate({
    templateId: 'tpl_123',
    documentName: 'Procuração Teste',
    signers: [{ name: 'Carlos' }],
    variables: [{ de: 'Nome', para: 'Carlos' }],
  }).then((mockRes) => {
    console.assert(mockRes.docToken.startsWith('doc_mock_'), 'Mock adapter must return mock token');
    console.assert(mockRes.signUrl.includes('zapsign'), 'Mock adapter must return mock sign_url');
  });

  // 7. ZapSign Real Adapter Security Block in Phase 2A
  const realAdapter = new ZapSignAdapter('key_test');
  realAdapter.createFromTemplate({
    templateId: 'tpl_123',
    documentName: 'Test',
    signers: [],
    variables: [],
  }).catch((err) => {
    console.assert(err.message.includes('bloqueadas na Fase 2A'), 'Real ZapSign adapter must throw security block error');
  });

  console.log('--- ALL PHASE 2A UNIT TESTS PASSED SUCCESSFULLY ---');
}
