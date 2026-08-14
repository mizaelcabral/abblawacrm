import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get('code');
  const next = requestUrl.searchParams.get('next') ?? '/dashboard';

  if (code) {
    const cookieStore = await cookies();
    const forwardedHost = request.headers.get('x-forwarded-host');
    const isLocalEnv = process.env.NODE_ENV === 'development';

    let targetOrigin = requestUrl.origin;
    if (!isLocalEnv && forwardedHost) {
      targetOrigin = `https://${forwardedHost}`;
    }

    const cleanNextPath = next.startsWith('/') ? next : `/${next}`;
    let redirectUrl = `${targetOrigin}${cleanNextPath}`;
    redirectUrl = redirectUrl.replace(/#_=_$/, '');

    // 1. Create the redirect response object FIRST
    const response = NextResponse.redirect(redirectUrl);

    // 2. Initialize Supabase client, binding cookie writes directly to response.cookies
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll();
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) => {
              try {
                cookieStore.set(name, value, options);
              } catch {
                // Ignore cookieStore mutation errors in server contexts
              }
              response.cookies.set(name, value, options);
            });
          },
        },
      }
    );

    // 3. Exchange OAuth code for session (triggers setAll above)
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error && data?.user) {
      // Ensure user profile terms & privacy consent are recorded
      try {
        await supabase
          .from('profiles')
          .update({
            terms_accepted: true,
            privacy_accepted: true,
            terms_accepted_at: new Date().toISOString(),
            privacy_accepted_at: new Date().toISOString(),
            consent_version: 'v1.0',
          })
          .eq('user_id', data.user.id);
      } catch {
        // Non-blocking
      }

      return response;
    }
  }

  return NextResponse.redirect(`${requestUrl.origin}/login?error=auth_callback_error`);
}
