import { AuthForm } from '@/components/auth/auth-form';

export default function LoginPage({ searchParams }: { searchParams: { next?: string; authError?: string } }) {
  return <AuthForm mode="login" nextPath={searchParams.next} authError={searchParams.authError} />;
}
