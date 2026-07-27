import { SupabaseClient } from '@supabase/supabase-js';

/**
 * Downloads an external contact avatar URL (e.g. from WhatsApp/Evolution API or Meta)
 * and uploads it to Supabase Storage in the public `avatars` bucket.
 * Returns the permanent public Supabase Storage URL, or the original raw URL if download/upload fails.
 */
export async function persistContactAvatar(
  supabaseAdmin: SupabaseClient,
  contactId: string,
  rawPictureUrl: string | null | undefined
): Promise<string | null> {
  if (!rawPictureUrl) return null;

  // If it's already hosted on Supabase Storage, no need to re-download
  if (rawPictureUrl.includes('supabase.co/storage/v1/object/public/avatars')) {
    return rawPictureUrl;
  }

  try {
    const response = await fetch(rawPictureUrl, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
    });

    if (!response.ok) {
      console.warn(
        `[Avatar Storage] Failed to fetch raw avatar (${response.status}) from ${rawPictureUrl}`
      );
      return rawPictureUrl;
    }

    const contentType = response.headers.get('content-type') || 'image/jpeg';
    const ext = contentType.includes('png')
      ? 'png'
      : contentType.includes('webp')
      ? 'webp'
      : 'jpg';
    const buffer = Buffer.from(await response.arrayBuffer());

    const storagePath = `contacts/contact-${contactId}.${ext}`;

    const { error: uploadError } = await supabaseAdmin.storage
      .from('avatars')
      .upload(storagePath, buffer, {
        contentType,
        upsert: true,
        cacheControl: '3600',
      });

    if (uploadError) {
      console.error('[Avatar Storage] Failed to upload avatar to Supabase Storage:', uploadError);
      return rawPictureUrl;
    }

    const { data: publicUrlData } = supabaseAdmin.storage
      .from('avatars')
      .getPublicUrl(storagePath);

    return publicUrlData?.publicUrl || rawPictureUrl;
  } catch (err) {
    console.error('[Avatar Storage] Exception while persisting avatar:', err);
    return rawPictureUrl;
  }
}
