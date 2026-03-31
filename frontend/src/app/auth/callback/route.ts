import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const next = searchParams.get('next') ?? '/home';

  if (code) {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error && data.session) {
      // Save Google tokens to profiles table
      const providerToken = data.session.provider_token;
      const providerRefreshToken = data.session.provider_refresh_token;

      if (providerToken) {
        await supabase
          .from('profiles')
          .update({
            google_access_token: providerToken,
            google_refresh_token: providerRefreshToken,
          })
          .eq('id', data.session.user.id);
      }

      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth_failed`);
}
