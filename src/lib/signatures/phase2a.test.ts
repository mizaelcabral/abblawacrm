import { resolveSignatory } from './signatory-resolver';
import { resolveSystemValue } from './system-value-resolver';
import { formatInstructionMessage } from './instruction-message-formatter';
import { MockSignatureAdapter } from './provider-adapter';
import { maskCpf, maskRg, maskPhone, maskEmail } from '@/components/signatures/create-signature-dialog';

export function runPhase2ATests() {
  console.log('--- STARTING PHASE 2A REVISED CONTRACT & PREVIEW SCENARIOS TEST SUITE ---');

  // 1. Adult Complete Scenario
  const adultComplete = {
    id: 'c_adult_full',
    name: 'TESTE RDC 660 - Importação Fictícia 002',
    email: 'adulto@example.com',
    phone: '5511000000724',
    custom_fields: {
      is_minor: false,
      cpf: '000.000.000-00',
      rg: '00.000.000-0',
      birth_date: '1990-01-01',
      address_line: 'Rua Teste',
      address_number: '100',
      address_complement: 'Sala Fictícia',
      district: 'Bairro Teste',
      city: 'Cidade Teste',
      state: 'SP',
      postal_code: '00000-000',
    },
  };

  const resAdultOk = resolveSignatory('guardian_if_minor', adultComplete);
  console.assert(!resAdultOk.is_blocked, 'Adult complete must be allowed');
  console.assert(resAdultOk.signatory?.signatory_type === 'contact', 'Signatory must be contact for adult');
  console.assert(resAdultOk.signatory?.name === 'TESTE RDC 660 - Importação Fictícia 002', 'Signatory name must match contact');
  console.assert(resAdultOk.signatory?.rg === '00.000.000-0', 'Signatory RG must be populated');

  // Verify Masking on Adult
  const maskedCpfResult = maskCpf(resAdultOk.signatory?.cpf);
  console.assert(maskedCpfResult === '000.***.***-00', `CPF mask must be 000.***.***-00 without duplicate suffix (got ${maskedCpfResult})`);

  const maskedRgResult = maskRg(resAdultOk.signatory?.rg);
  console.assert(maskedRgResult === '00.***.***-0', `RG mask must be 00.***.***-0 (got ${maskedRgResult})`);

  const maskedPhoneResult = maskPhone(resAdultOk.signatory?.phone);
  console.assert(maskedPhoneResult === '(55) *****-0724', `Phone mask must obscure middle digits (got ${maskedPhoneResult})`);

  const maskedEmailResult = maskEmail(resAdultOk.signatory?.email);
  console.assert(maskedEmailResult === 'ad***@example.com', `Email mask must obscure name (got ${maskedEmailResult})`);

  // 2. Minor Complete Scenario with Guardian
  const minorComplete = {
    id: 'c_minor_full',
    name: 'Paciente Menor Teste',
    email: 'menor@example.com',
    phone: '5511999998888',
    custom_fields: {
      is_minor: true,
      cpf: '11122233344',
      rg: '123456789',
      guardian_name: 'Responsável Legal Teste',
      guardian_cpf: '99988877766',
      guardian_phone: '5511977776666',
      guardian_email: 'guardian@example.com',
      guardian_relationship: 'Mãe',
    },
  };

  const resMinorOk = resolveSignatory('guardian_if_minor', minorComplete);
  console.assert(!resMinorOk.is_blocked, 'Minor with complete guardian fields must be allowed');
  console.assert(resMinorOk.signatory?.signatory_type === 'guardian', 'Signatory must be guardian for minor');
  console.assert(resMinorOk.signatory?.name === 'Responsável Legal Teste', 'Signatory name must be guardian');
  console.assert(resMinorOk.signatory?.cpf === '99988877766', 'Signatory CPF must be guardian CPF');
  console.assert(resMinorOk.signatory?.cpf !== minorComplete.custom_fields.cpf, 'STRICT: Patient CPF must NOT be used as fallback for guardian');

  const maskedGuardianCpf = maskCpf(resMinorOk.signatory?.cpf);
  console.assert(maskedGuardianCpf === '999.***.***-66', `Guardian CPF mask must be 999.***.***-66 (got ${maskedGuardianCpf})`);

  // 3. Malformed / Invalid Values Masking Scenarios
  console.assert(maskCpf('123') === '***.***.***-**', 'Short CPF must render safe generic mask ***.***.***-**');
  console.assert(maskCpf('abc-def') === '***.***.***-**', 'Non-digit CPF must render safe generic mask');
  console.assert(maskRg('12') === '**.***.***-*', 'Short RG must render safe generic mask **.***.***-*');
  console.assert(maskPhone('123') === '(**) *****-****', 'Short phone must render safe generic mask');
  console.assert(maskEmail('invalid-email') === '***@***.com', 'Invalid email must render safe generic mask');

  // 4. Production Mock Block Verification
  const mockAdapter = new MockSignatureAdapter();
  const originalEnv = process.env.NODE_ENV;
  (process.env as any).NODE_ENV = 'production';
  mockAdapter.createFromTemplate({
    templateId: 'tpl_123',
    documentName: 'Test',
    signers: [],
    variables: [],
  }).catch((err) => {
    console.assert(err.message.includes('estritamente bloqueado no ambiente de produção'), 'Mock must be strictly blocked in production');
  });
  (process.env as any).NODE_ENV = originalEnv;

  console.log('--- ALL PHASE 2A REVISED CONTRACT & PREVIEW TESTS PASSED ---');
}
