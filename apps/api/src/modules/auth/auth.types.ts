export interface AuthIdentity {
  id: string;
  email: string;
  fullName?: string | null;
  emailVerified?: boolean;
}

export interface AuthContext extends AuthIdentity {
  profileId: string;
}

export type AccessTokenVerifier = (token: string) => Promise<AuthIdentity | null>;
