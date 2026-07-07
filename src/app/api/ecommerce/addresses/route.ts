import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { normalizePhone } from '@/lib/whatsapp/phone-utils';

/**
 * GET /api/ecommerce/addresses
 * Busca endereços de entrega salvos de um cliente com base em seu telefone e accountId da loja.
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const phone = searchParams.get('phone');
    const accountId = searchParams.get('accountId');

    if (!phone || !accountId) {
      return NextResponse.json(
        { error: 'Parâmetros phone e accountId são obrigatórios.' },
        { status: 400 }
      );
    }

    const supabase = await createClient();
    const normalized = normalizePhone(phone);
    if (!normalized) {
      return NextResponse.json([]);
    }

    // Buscar contato correspondente (usando sufixo dos últimos 8 dígitos para cobrir diferenças de DDD/DDI)
    const suffix = normalized.length >= 8 ? normalized.slice(-8) : normalized;

    const { data: contacts, error: contactError } = await supabase
      .from('contacts')
      .select('id, name, phone')
      .eq('account_id', accountId)
      .like('phone', `%${suffix}`);

    if (contactError) throw contactError;
    if (!contacts || contacts.length === 0) {
      return NextResponse.json([]);
    }

    // Encontrar o contato exato cujo telefone bate com regras de normalização
    // Usamos os últimos 8 dígitos como critério tolerante (phonesMatch)
    const matchedContact = contacts.find((c) => {
      const cNorm = normalizePhone(c.phone || '');
      return cNorm.slice(-8) === normalized.slice(-8);
    });

    if (!matchedContact) {
      return NextResponse.json([]);
    }

    // Buscar endereços do contato encontrado
    const { data: addresses, error: addressError } = await supabase
      .from('shipping_addresses')
      .select('*')
      .eq('contact_id', matchedContact.id)
      .order('is_default', { ascending: false });

    if (addressError) throw addressError;

    return NextResponse.json(addresses || []);
  } catch (err: any) {
    console.error('Erro na API de busca de endereços:', err);
    return NextResponse.json(
      { error: 'Erro interno ao processar a requisição.' },
      { status: 500 }
    );
  }
}
