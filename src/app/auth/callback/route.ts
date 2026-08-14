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

    // Create the redirect response object first
    const response = NextResponse.redirect(redirectUrl);

    // Initialize Supabase client
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
              const cookieOptions = { ...options };
              if (!cookieOptions.domain) delete cookieOptions.domain;
              try {
                cookieStore.set(name, value, cookieOptions);
              } catch {
                // Ignore in server contexts
              }
              response.cookies.set(name, value, cookieOptions);
            });
          },
        },
      }
    );

    // Exchange OAuth code for session
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error && data?.user) {
      // Record terms/privacy consent
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

      // Explicitly mirror all freshly set auth cookies onto response
      const allCookies = cookieStore.getAll();
      allCookies.forEach((c) => {
        if (c.name.includes('auth-token') || c.name.includes('supabase') || c.name.includes('sb-')) {
          response.cookies.set(c.name, c.value, {
            path: '/',
            sameSite: 'lax',
            secure: process.env.NODE_ENV === 'production',
          });
        }
      });

      return response;
    }
  }

  return NextResponse.redirect(`${requestUrl.origin}/login?error=auth_callback_error`);
}
