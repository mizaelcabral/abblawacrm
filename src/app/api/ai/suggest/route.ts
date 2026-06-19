import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { generateAIResponse } from '@/lib/ai/service'
import { verifyBillingAndUsage, incrementAIConsumption } from '@/lib/billing/guard'

export async function GET(request: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const conversationId = searchParams.get('conversation_id')
  if (!conversationId) {
    return NextResponse.json({ error: 'conversation_id is required' }, { status: 400 })
  }

  // Fetch the conversation and check account_id to enforce RLS/ownership
  const { data: conversation, error: convError } = await supabase
    .from('conversations')
    .select('account_id, ai_system_prompt')
    .eq('id', conversationId)
    .single()

  if (convError || !conversation) {
    return NextResponse.json({ error: 'Conversation not found or access denied' }, { status: 404 })
  }

  // Check subscription limits and status
  const billingGuard = await verifyBillingAndUsage(conversation.account_id, 'suggestion')
  if (!billingGuard.allowed) {
    return NextResponse.json({ error: billingGuard.reason }, { status: 403 })
  }

  // Fetch the last customer message text to use as query for prompt/RAG
  const { data: lastMsg } = await supabase
    .from('messages')
    .select('content_text')
    .eq('conversation_id', conversationId)
    .eq('sender_type', 'customer')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const queryText = lastMsg?.content_text || ''

  try {
    // Generate suggestion (with RAG enabled)
    const result = await generateAIResponse(
      queryText,
      conversationId,
      conversation.account_id,
      conversation.ai_system_prompt || undefined,
      true // use RAG
    )

    // Increment usage counter after successful generation
    await incrementAIConsumption(conversation.account_id)

    return NextResponse.json({ suggestion: result.text })
  } catch (error) {
    console.error('[AI Suggest] Failed to generate suggestion:', error)
    return NextResponse.json({ error: 'Failed to generate AI suggestion' }, { status: 500 })
  }
}
