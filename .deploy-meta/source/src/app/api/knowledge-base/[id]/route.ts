import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { generateEmbedding } from '@/lib/ai/service'

// PATCH /api/knowledge-base/[id] — update article
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
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
  const { title, content, category, tags, is_active, source_url } = body

  // Fetch existing article to check ownership
  const { data: existing } = await supabase
    .from('knowledge_base')
    .select('account_id, content')
    .eq('id', id)
    .eq('account_id', profile.account_id)
    .single()

  if (!existing) return NextResponse.json({ error: 'Article not found' }, { status: 404 })

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (title !== undefined) updates.title = title.trim()
  if (content !== undefined) updates.content = content.trim()
  if (category !== undefined) updates.category = category
  if (tags !== undefined) updates.tags = tags
  if (is_active !== undefined) updates.is_active = is_active
  if (source_url !== undefined) updates.source_url = source_url?.trim() || null

  // Regenerate embedding if content or title changed
  const contentChanged = content !== undefined && content.trim() !== existing.content
  if (contentChanged) {
    try {
      const newTitle = title?.trim() ?? ''
      const newContent = content.trim()
      updates.embedding = await generateEmbedding(`${newTitle}\n\n${newContent}`)
    } catch (err) {
      console.error('[KB] Failed to regenerate embedding:', err)
    }
  }

  const { data, error } = await supabase
    .from('knowledge_base')
    .update(updates)
    .eq('id', id)
    .eq('account_id', profile.account_id)
    .select('id, title, content, category, tags, is_active, source, source_url, view_count, created_at, updated_at')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ item: data })
}

// DELETE /api/knowledge-base/[id]
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('account_id')
    .eq('user_id', user.id)
    .single()

  if (!profile?.account_id) return NextResponse.json({ error: 'Account not found' }, { status: 404 })

  const { error } = await supabase
    .from('knowledge_base')
    .delete()
    .eq('id', id)
    .eq('account_id', profile.account_id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
