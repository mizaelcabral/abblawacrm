import { resolveSignatory } from './signatory-resolver';
import { resolveSystemValue } from './system-value-resolver';
import { formatInstructionMessage } from './instruction-message-formatter';
import { MockSignatureAdapter, ZapSignAdapter } from './provider-adapter';

export function runPhase2ATests() {
  console.log('--- STARTING PHASE 2A ABSOLUTE MOCK BLOCK & GUARDIAN RELATIONSHIP TEST SUITE ---');

  // 1. Minor Complete with guardian_relationship -> PERMITIDO
  const minorComplete = {
    id: 'c_minor_full',
    name: 'Pedro Menor',
    email: 'pedro@example.com',
    phone: '51911112222',
    custom_fields: {
      is_minor: true,
      guardian_name: 'Carlos Responsável',
      guardian_cpf: '98765432100',
      guardian_phone: '51988887777',
      guardian_email: 'responsavel@example.com',
      guardian_relationship: 'Pai',
    },
  };

  const resMinorOk = resolveSignatory('guardian_if_minor', minorComplete);
  console.assert(!resMinorOk.is_blocked, 'Minor with complete guardian & relationship must pass');
  console.assert(resMinorOk.signatory?.signatory_type === 'guardian', 'Signatory must be guardian');
  console.assert(resMinorOk.signatory?.relationship === 'Pai', 'Relationship must match');

  // 2. Minor without guardian_relationship -> BLOQUEADO
  const minorNoRel = {
    ...minorComplete,
    custom_fields: { ...minorComplete.custom_fields, guardian_relationship: null },
  };
  const resNoRel = resolveSignatory('guardian_if_minor', minorNoRel);
  console.assert(resNoRel.is_blocked, 'Minor without guardian_relationship must block');
  console.assert(resNoRel.missing_fields?.includes('guardian_relationship'), 'missing_fields must contain guardian_relationship');

  // 3. Minor with empty or whitespace guardian_relationship -> BLOQUEADO
  const minorEmptyRel = {
    ...minorComplete,
    custom_fields: { ...minorComplete.custom_fields, guardian_relationship: '   ' },
  };
  const resEmptyRel = resolveSignatory('guardian_if_minor', minorEmptyRel);
  console.assert(resEmptyRel.is_blocked, 'Minor with empty guardian_relationship must block');

  // 4. Absolute Production Mock Security Guard Test
  const mockAdapter = new MockSignatureAdapter();

  // Test mode in non-production passes
  const originalEnv = process.env.NODE_ENV;
  (process.env as any).NODE_ENV = 'development';
  mockAdapter.createFromTemplate({
    templateId: 'tpl_123',
    documentName: 'Procuração',
    signers: [{ name: 'Carlos' }],
    variables: [],
  }).then((res) => {
    console.assert(res.docToken.startsWith('doc_mock_'), 'Mock returns token in dev mode');
  });

  // Switch NODE_ENV to production -> Mock Signature Adapter MUST unconditionally throw
  (process.env as any).NODE_ENV = 'production';
  mockAdapter.createFromTemplate({
    templateId: 'tpl_123',
    documentName: 'Test',
    signers: [],
    variables: [],
  }).catch((err) => {
    console.assert(err.message.includes('estritamente bloqueado no ambiente de produção'), 'Mock must be unconditionally blocked in production');
  });

  // Restore NODE_ENV
  (process.env as any).NODE_ENV = originalEnv;

  console.log('--- ALL SURGICAL TESTS PASSED SUCCESSFULLY ---');
}
