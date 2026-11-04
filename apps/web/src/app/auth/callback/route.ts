import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

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

  if (!supabaseUrl || !supabaseAnonKey) {
    return NextResponse.json(
      { error: { code: 'AUTH_NOT_CONFIGURED', message: 'Supabase authentication is not configured.' } },
      { status: 503 }
    );
  }

  if (!code) {
    return NextResponse.json(
      { error: { code: 'AUTH_CODE_MISSING', message: 'The authentication link is missing its code.' } },
      { status: 400 }
    );
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

  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    console.error('Supabase authentication callback could not exchange its code.');
    return NextResponse.json(
      { error: { code: 'AUTH_CALLBACK_FAILED', message: 'The authentication link is invalid or expired.' } },
      { status: 400 }
    );
  }

  return response;
}
