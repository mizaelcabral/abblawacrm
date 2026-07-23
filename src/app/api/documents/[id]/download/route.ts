import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/automations/admin-client';

// ponytail: Secure download route that enforces auth, checks account RLS, logs audit trail and returns 15-minute signed URL
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: documentId } = await params;
    const supabase = await createClient();

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const admin = supabaseAdmin();

    // 1. Fetch user's active profile and account_id
    const { data: profile } = await admin
      .from('profiles')
      .select('account_id, email')
      .eq('user_id', user.id)
      .single();

    if (!profile || !profile.account_id) {
      return NextResponse.json({ error: 'Forbidden: Account access required' }, { status: 403 });
    }

    // 2. Fetch document verifying account_id ownership
    const { data: doc } = await admin
      .from('documents')
      .select('id, account_id, display_name, current_version_id')
      .eq('id', documentId)
      .eq('account_id', profile.account_id)
      .eq('is_archived', false)
      .maybeSingle();

    if (!doc || !doc.current_version_id) {
      return NextResponse.json({ error: 'Document not found or has no uploaded file' }, { status: 404 });
    }

    // 3. Fetch latest physical version file_path
    const { data: version } = await admin
      .from('document_versions')
      .select('file_path, mime_type')
      .eq('id', doc.current_version_id)
      .eq('account_id', profile.account_id)
      .single();

    if (!version || !version.file_path) {
      return NextResponse.json({ error: 'Document version file not found' }, { status: 404 });
    }

    // 4. Generate 15-minute presigned URL from private storage bucket
    const { data: signedData, error: signedError } = await admin.storage
      .from('protected-documents')
      .createSignedUrl(version.file_path, 900); // 15 minutes

    if (signedError || !signedData?.signedUrl) {
      console.error('[documents/download] Failed to generate signed URL:', signedError);
      return NextResponse.json({ error: 'Failed to generate secure download link' }, { status: 500 });
    }

    // 5. Audit Log (fire and forget)
    void admin.from('audit_logs').insert({
      account_id: profile.account_id,
      user_id: user.id,
      user_email: profile.email,
      action: 'document.download_url_generated',
      target_type: 'documents',
      target_id: doc.id,
      details: {
        display_name: doc.display_name,
        expires_in_seconds: 900,
      },
    });

    return NextResponse.json({
      url: signedData.signedUrl,
      expires_in: 900,
      mime_type: version.mime_type,
      display_name: doc.display_name,
    });
  } catch (err: any) {
    console.error('[documents/download] Exception:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
