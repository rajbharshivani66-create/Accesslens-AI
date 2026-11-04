import { AuthForm } from '@/components/auth/auth-form';

export default function LoginPage({ searchParams }: { searchParams: { next?: string } }) {
  return <AuthForm mode="login" nextPath={searchParams.next} />;
}
