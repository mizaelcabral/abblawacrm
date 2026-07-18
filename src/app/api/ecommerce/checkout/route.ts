import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { normalizePhone } from '@/lib/whatsapp/phone-utils';
import { WooviClient } from '@/lib/woovi/client';
import fs from 'fs';
import path from 'path';

// Helper to safely retrieve WOOVI_MASTER_APP_ID bypassing Webpack/Turbopack caching bugs
function getWooviMasterAppId(): string | null {
  if (process.env.NODE_ENV === 'test') {
    return process.env.WOOVI_MASTER_APP_ID || null;
  }

  const envVal = process.env.WOOVI_MASTER_APP_ID;
  if (envVal) return envVal;

  try {
    let currentDir = process.cwd();
    try {
      if (typeof __dirname !== 'undefined') {
        currentDir = __dirname;
      }
    } catch {}

    let foundPath = '';
    for (let i = 0; i < 10; i++) {
      const checkPath = path.resolve(currentDir, '.env.local');
      if (fs.existsSync(checkPath)) {
        foundPath = checkPath;
        break;
      }
      const parentDir = path.dirname(currentDir);
      if (parentDir === currentDir) break;
      currentDir = parentDir;
    }

    if (!foundPath && currentDir !== process.cwd()) {
      const checkPath = path.resolve(process.cwd(), '.env.local');
      if (fs.existsSync(checkPath)) {
        foundPath = checkPath;
      }
    }

    if (foundPath) {
      const envContent = fs.readFileSync(foundPath, 'utf-8');
      let parsedValue: string | null = null;
      envContent.split('\n').forEach((line) => {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith('#')) {
          const firstEquals = trimmed.indexOf('=');
          if (firstEquals !== -1) {
            const key = trimmed.substring(0, firstEquals).trim();
            const val = trimmed.substring(firstEquals + 1).trim();
            if (key === 'WOOVI_MASTER_APP_ID' && val) {
              parsedValue = val;
            }
          }
        }
      });
      return parsedValue;
    }
  } catch (err) {
    console.error('[ecommerce/checkout] Failed to manually load WOOVI_MASTER_APP_ID:', err);
  }

  return null;
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { accountId, customerInfo, cartItems, shippingAddress } = body;

    if (!accountId || !customerInfo || !cartItems || cartItems.length === 0) {
      return NextResponse.json(
        { error: 'Dados insuficientes para processar o checkout.' },
        { status: 400 }
      );
    }

    const supabase = await createClient();

    // 1. Obter configuração do Woovi do tenant
    const { data: wooviConfig, error: configError } = await supabase
      .from('woovi_config')
      .select('*')
      .eq('account_id', accountId)
      .maybeSingle();

    if (configError || !wooviConfig || !wooviConfig.app_id) {
      return NextResponse.json(
        { error: 'A loja não possui credenciais Woovi ativas.' },
        { status: 400 }
      );
    }

    // Obter taxas de comissão/markup do account (Super Admin)
    const { data: account } = await supabase
      .from('accounts')
      .select('woovi_markup_fixed, woovi_markup_percent, woovi_markup_pix_key')
      .eq('id', accountId)
      .maybeSingle();

    // 2. Buscar variações e produtos correspondentes
    const variationIds = cartItems.map((item: any) => item.variationId);
    const { data: variations, error: varError } = await supabase
      .from('product_variations')
      .select(`
        *,
        product:products(*)
      `)
      .in('id', variationIds);

    if (varError || !variations || variations.length === 0) {
      return NextResponse.json(
        { error: 'Erro ao validar os produtos no carrinho.' },
        { status: 400 }
      );
    }

    // 3. Calcular valores
    let itemsAmount = 0;
    let hasPhysical = false;
    let maxShippingFee = 0;

    const validatedItems = cartItems.map((item: any) => {
      const matchedVar = variations.find((v: any) => v.id === item.variationId);
      if (!matchedVar) {
        throw new Error(`Variação ${item.variationId} não encontrada.`);
      }

      const prod = matchedVar.product;
      const price = Number(matchedVar.price);
      itemsAmount += price * item.quantity;

      if (prod.product_type === 'physical') {
        hasPhysical = true;
        const fee = prod.shipping_fee ? Number(prod.shipping_fee) : null;
        if (fee !== null && fee > maxShippingFee) {
          maxShippingFee = fee;
        }
      }

      return {
        variationId: item.variationId,
        quantity: item.quantity,
        unitPrice: price,
        isUpsell: item.isUpsell || false,
      };
    });

    // Taxa de frete final
    let shippingAmount = 0;
    if (hasPhysical) {
      // Se não houver frete específico em nenhum item físico, usa o frete padrão da loja
      shippingAmount = maxShippingFee > 0 ? maxShippingFee : Number(wooviConfig.default_shipping_fee || 0);
    }

    const totalAmount = itemsAmount + shippingAmount;

    // 4. Buscar ou Criar Contato do Cliente no CRM
    const clientPhone = normalizePhone(customerInfo.phone);
    let contactId: string | null = null;

    if (clientPhone) {
      const suffix = clientPhone.length >= 8 ? clientPhone.slice(-8) : clientPhone;
      const { data: contacts } = await supabase
        .from('contacts')
        .select('id, phone')
        .eq('account_id', accountId)
        .like('phone', `%${suffix}`);

      if (contacts && contacts.length > 0) {
        const matched = contacts.find((c) => {
          const cNorm = normalizePhone(c.phone || '');
          return cNorm.slice(-8) === clientPhone.slice(-8);
        });
        if (matched) {
          contactId = matched.id;
        }
      }

      // Se não encontrou, insere novo contato
      if (!contactId) {
        const { data: newContact, error: insertError } = await supabase
          .from('contacts')
          .insert({
            account_id: accountId,
            phone: customerInfo.phone,
            name: customerInfo.name,
            email: customerInfo.email,
          })
          .select()
          .single();

        if (!insertError && newContact) {
          contactId = newContact.id;
        }
      }
    }

    // 5. Tratar endereço de entrega (se houver e for produto físico)
    let shippingAddressId: string | null = null;
    let savedAddress: any = null;

    if (hasPhysical && shippingAddress && contactId) {
      // Se o cliente escolheu salvar o endereço, define is_default
      const shouldSave = shippingAddress.saveAddress || false;

      if (shouldSave) {
        // Desativar outros endereços default deste contato
        await supabase
          .from('shipping_addresses')
          .update({ is_default: false })
          .eq('contact_id', contactId);
      }

      const { data: addr, error: addrError } = await supabase
        .from('shipping_addresses')
        .insert({
          contact_id: contactId,
          street: shippingAddress.street,
          number: shippingAddress.number,
          complement: shippingAddress.complement || null,
          neighborhood: shippingAddress.neighborhood,
          city: shippingAddress.city,
          state: shippingAddress.state,
          postal_code: shippingAddress.postal_code,
          is_default: shouldSave,
        })
        .select()
        .single();

      if (!addrError && addr) {
        shippingAddressId = addr.id;
        savedAddress = addr;
      }
    }

    // 6. Criar Pedido na base de dados (Pendente)
    const orderPayload = {
      account_id: accountId,
      contact_id: contactId,
      status: 'pending',
      shipping_amount: shippingAmount,
      items_amount: itemsAmount,
      total_amount: totalAmount,
      customer_info: {
        name: customerInfo.name,
        phone: customerInfo.phone,
        email: customerInfo.email,
        address: shippingAddress || null,
      },
      shipping_address_id: shippingAddressId,
    };

    const { data: order, error: orderError } = await supabase
      .from('orders')
      .insert(orderPayload)
      .select()
      .single();

    if (orderError || !order) {
      throw new Error(`Falha ao criar o pedido: ${orderError?.message}`);
    }

    // 7. Criar itens do pedido no banco de dados
    const orderItemsPayload = validatedItems.map((item: any) => ({
      order_id: order.id,
      product_variation_id: item.variationId,
      quantity: item.quantity,
      unit_price: item.unitPrice,
      is_upsell: item.isUpsell,
    }));

    const { error: itemsError } = await supabase
      .from('order_items')
      .insert(orderItemsPayload);

    if (itemsError) {
      // Rollback manual do pedido (YAGNI/Ponytail style)
      await supabase.from('orders').delete().eq('id', order.id);
      throw new Error(`Falha ao registrar itens do pedido: ${itemsError.message}`);
    }

    // 8. Chamar Woovi API para gerar cobrança Pix
    const isSandbox =
      wooviConfig.app_id.includes('sandbox') ||
      wooviConfig.app_id.startsWith('plugin_sb') ||
      process.env.NEXT_PUBLIC_SUPABASE_URL?.includes('localhost');

    const wooviClient = new WooviClient(wooviConfig.app_id, isSandbox);

    const valueCents = Math.round(totalAmount * 100);

    const markupFixed = account?.woovi_markup_fixed !== undefined && account?.woovi_markup_fixed !== null 
      ? Number(account.woovi_markup_fixed) 
      : 0.50;
    const markupPercent = account?.woovi_markup_percent !== undefined && account?.woovi_markup_percent !== null 
      ? Number(account.woovi_markup_percent) 
      : 1.00;
    const markupPixKey = account?.woovi_markup_pix_key || process.env.WOOVI_MASTER_PIX_KEY;

    const splits = [];
    if (markupPixKey) {
      const fixedCents = Math.round(markupFixed * 100);
      const percentCents = Math.round(valueCents * (markupPercent / 100));
      const splitValue = fixedCents + percentCents;

      // ponytail: Only split if the calculated markup is valid and strictly less than total value
      if (splitValue > 0 && splitValue < valueCents) {
        splits.push({
          pixKey: markupPixKey,
          value: splitValue,
        });
      }
    }

    const masterAppId = getWooviMasterAppId();
    const isSubaccount = masterAppId && wooviConfig.app_id === masterAppId;

    let chargeResponse;
    try {
      chargeResponse = await wooviClient.createCharge({
        correlationID: order.id,
        value: valueCents,
        customer: {
          name: customerInfo.name,
          email: customerInfo.email,
          phone: customerInfo.phone,
        },
        ...(splits.length > 0 ? { splits } : {}),
        ...(isSubaccount && wooviConfig.secret_key ? { subaccount: wooviConfig.secret_key } : {}),
      });
    } catch (err: any) {
      if (splits.length > 0 && (err.message.includes('split') || err.message.includes('virtual') || err.message.includes('400') || err.message.includes('pixKey'))) {
        console.warn('[ecommerce/checkout] Split charge failed. Retrying without splits:', err.message);
        chargeResponse = await wooviClient.createCharge({
          correlationID: order.id,
          value: valueCents,
          customer: {
            name: customerInfo.name,
            email: customerInfo.email,
            phone: customerInfo.phone,
          },
          ...(isSubaccount && wooviConfig.secret_key ? { subaccount: wooviConfig.secret_key } : {}),
        });
      } else {
        throw err;
      }
    }

    // 9. Atualizar Pedido com os dados Pix da Woovi
    const { data: updatedOrder, error: updateError } = await supabase
      .from('orders')
      .update({
        woovi_correlation_id: chargeResponse.correlationID,
        woovi_qrcode_image: chargeResponse.charge.qrCodeImage,
        woovi_brcode: chargeResponse.charge.brCode,
        updated_at: new Date().toISOString(),
      })
      .eq('id', order.id)
      .select()
      .single();

    if (updateError) {
      console.error('Falha ao atualizar dados Woovi no pedido:', updateError);
    }

    return NextResponse.json(updatedOrder || order);
  } catch (err: any) {
    console.error('Erro no Checkout API:', err);
    return NextResponse.json(
      { error: err.message || 'Erro interno ao processar o checkout.' },
      { status: 500 }
    );
  }
}
