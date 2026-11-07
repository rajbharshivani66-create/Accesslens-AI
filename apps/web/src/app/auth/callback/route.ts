import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

type EmailOtpType = 'signup' | 'invite' | 'magiclink' | 'recovery' | 'email_change' | 'email';

function safeRedirectPath(value: string | null): string {
  if (!value || !value.startsWith('/') || value.startsWith('//') || value.includes('\\')) {
    return '/dashboard';
  }
  return value;
}

export async function GET(request: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const code = request.nextUrl.searchParams.get('code');
  const tokenHash = request.nextUrl.searchParams.get('token_hash');
  const otpType = request.nextUrl.searchParams.get('type');
  const allowedOtpTypes = new Set<EmailOtpType>(['signup', 'invite', 'magiclink', 'recovery', 'email_change', 'email']);

  if (!supabaseUrl || !supabaseAnonKey) {
    return NextResponse.json(
      { error: { code: 'AUTH_NOT_CONFIGURED', message: 'Supabase authentication is not configured.' } },
      { status: 503 }
    );
  }

  if (!code && (!tokenHash || !otpType || !allowedOtpTypes.has(otpType as EmailOtpType))) {
    return NextResponse.redirect(new URL('/login?authError=invalid-link', request.url));
  }

  const response = NextResponse.redirect(
    new URL(safeRedirectPath(request.nextUrl.searchParams.get('next')), request.url)
  );
  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options)
        );
      }
    }
  });

  const { error } = code
    ? await supabase.auth.exchangeCodeForSession(code)
    : await supabase.auth.verifyOtp({ token_hash: tokenHash!, type: otpType as EmailOtpType });
  if (error) {
    console.error('Supabase authentication callback could not exchange its code.');
    return NextResponse.redirect(new URL('/login?authError=link-expired', request.url));
  }

  return response;
}
