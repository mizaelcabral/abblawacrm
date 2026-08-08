'use server';

import { createClient } from '@/lib/supabase/server';

export async function lookupCustomerOrders(tenantSlug: string, query: string) {
  const supabase = await createClient();
  
  // Resolve account_id if tenantSlug is a slug
  const { data: config } = await supabase
    .from('woovi_config')
    .select('account_id')
    .or(`account_id.eq.${tenantSlug},store_slug.eq.${tenantSlug}`)
    .single();

  if (!config) return { error: 'Loja não encontrada' };
  
  const accountId = config.account_id;

  // Search by phone or email in customer_info jsonb with strict matching
  const { data: orders, error } = await supabase
    .from('orders')
    .select('*, order_items(quantity)')
    .eq('account_id', accountId)
    .or(`customer_info->>phone.eq.${query},customer_info->>email.eq.${query}`)
    .order('created_at', { ascending: false });

  if (error) {
    return { error: error.message };
  }

  return { orders };
}

export async function getOrderDetails(orderId: string, tenantSlug: string) {
  const supabase = await createClient();
  
  const { data: config } = await supabase
    .from('woovi_config')
    .select('account_id, store_name, store_logo_url')
    .or(`account_id.eq.${tenantSlug},store_slug.eq.${tenantSlug}`)
    .single();

  if (!config) return { error: 'Loja não encontrada' };
  
  const accountId = config.account_id;

  const { data: order, error } = await supabase
    .from('orders')
    .select(`
      *,
      order_items (
        *,
        product_variations (
          *,
          products (*)
        )
      )
    `)
    .eq('id', orderId)
    .eq('account_id', accountId)
    .single();

  if (error) return { error: error.message };
  if (!order) return { error: 'Pedido não encontrado' };

  // Fetch shipping address if present
  let address = null;
  if (order.shipping_address_id) {
    const { data: addr } = await supabase
      .from('shipping_addresses')
      .select('*')
      .eq('id', order.shipping_address_id)
      .single();
    address = addr;
  }

  return { order, config, address };
}
