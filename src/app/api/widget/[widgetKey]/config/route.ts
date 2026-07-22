import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ widgetKey: string }> }
) {
  const { widgetKey } = await params;
  const supabase = createAdminClient();

  const { data: config, error } = await supabase
    .from('chat_widget_configs')
    .select('id, primary_color, title, subtitle, welcome_message, position, require_lead_info, ask_name, ask_email, ask_phone, is_active')
    .eq('widget_key', widgetKey)
    .eq('is_active', true)
    .single();

  if (error || !config) {
    return NextResponse.json({ error: 'Widget not found or inactive' }, { status: 404 });
  }

  return NextResponse.json(config, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
    },
  });
}

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}
