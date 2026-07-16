import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { generateEmbedding } from '@/lib/ai/service'

// GET /api/knowledge-base — list all articles for the account
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('account_id')
    .eq('user_id', user.id)
    .single()

  if (!profile?.account_id) return NextResponse.json({ error: 'Account not found' }, { status: 404 })

  const { data, error } = await supabase
    .from('knowledge_base')
    .select('id, title, content, category, tags, is_active, source, source_url, view_count, created_at, updated_at')
    .eq('account_id', profile.account_id)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ items: data })
}

// POST /api/knowledge-base — create article with auto-embedding
export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('account_id')
    .eq('user_id', user.id)
    .single()

  if (!profile?.account_id) return NextResponse.json({ error: 'Account not found' }, { status: 404 })

  const body = await request.json()
  const { title, content, category = 'FAQ', tags = [], source_url } = body

  if (!title?.trim() || !content?.trim()) {
    return NextResponse.json({ error: 'title and content are required' }, { status: 400 })
  }

  // Generate embedding for semantic search
  let embedding: number[] | null = null
  try {
    embedding = await generateEmbedding(`${title}\n\n${content}`)
  } catch (err) {
    console.error('[KB] Failed to generate embedding:', err)
    // Still create the article, just without embedding (won't appear in AI RAG)
  }

  const { data, error } = await supabase
    .from('knowledge_base')
    .insert({
      account_id: profile.account_id,
      title: title.trim(),
      content: content.trim(),
      category,
      tags,
      source_url: source_url?.trim() || null,
      embedding,
      is_active: true,
      source: 'manual',
    })
    .select('id, title, content, category, tags, is_active, source, source_url, view_count, created_at, updated_at')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ item: data }, { status: 201 })
}
