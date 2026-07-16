import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { generateEmbedding } from '@/lib/ai/service'

// GET /api/knowledge-base/search?q=<text>&limit=5
export async function GET(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('account_id')
    .eq('user_id', user.id)
    .single()

  if (!profile?.account_id) return NextResponse.json({ error: 'Account not found' }, { status: 404 })

  const { searchParams } = new URL(request.url)
  const query = searchParams.get('q')?.trim()
  const limit = Math.min(parseInt(searchParams.get('limit') ?? '5'), 10)

  if (!query) return NextResponse.json({ results: [] })

  try {
    const embedding = await generateEmbedding(query)
    const { data: matches, error } = await supabase.rpc('match_knowledge_base', {
      query_embedding: embedding,
      match_threshold: 0.3,
      match_count: limit,
      p_account_id: profile.account_id,
    })

    if (error) throw error
    return NextResponse.json({ results: matches ?? [] })
  } catch (err) {
    console.error('[KB Search]', err)
    return NextResponse.json({ error: 'Search failed' }, { status: 500 })
  }
}
