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
    const destinationUrl = `${targetOrigin}${cleanNextPath}`;

    // HTML response ensures Set-Cookie headers are committed cleanly AND Facebook's #_=_ trailing hash is stripped
    const response = new NextResponse(
      `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Autenticando no Abbla Hub...</title>
  <script>
    try {
      if (window.location.hash === '#_=_') {
        history.replaceState(null, null, window.location.href.split('#')[0]);
      }
    } catch (e) {}
    window.location.href = ${JSON.stringify(destinationUrl)};
  </script>
</head>
<body style="background:#090d16;color:#ffffff;display:flex;height:100vh;align-items:center;justify-content:center;font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;margin:0;">
  <div style="text-align:center;">
    <div style="width:36px;height:36px;border:3px solid rgba(99,102,241,0.2);border-top-color:#6366f1;border-radius:50%;animation:spin 0.8s linear infinite;margin:0 auto 16px;"></div>
    <p style="font-size:14px;color:#94a3b8;margin:0;">Entrando no Abbla Hub...</p>
  </div>
  <style>@keyframes spin { to { transform: rotate(360deg); } }</style>
</body>
</html>`,
      {
        headers: {
          'content-type': 'text/html; charset=utf-8',
        },
      }
    );

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
              cookieStore.set(name, value, options);
              response.cookies.set(name, value, options);
            });
          },
        },
      }
    );

    const { data, error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error && data?.user) {
      // Ensure user profile terms & privacy consent are set for social signins
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
        // Non-blocking if profile update fails
      }

      return response;
    }
  }

  return NextResponse.redirect(`${requestUrl.origin}/login?error=auth_callback_error`);
}
