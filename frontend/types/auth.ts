export type Role = "ADMIN" | "ANALYST" | "AUDITOR";

export interface AuthUser {
  id: number;
  email: string;
  role: Role;
}

export interface AuthState {
  user: AuthUser | null;
  token: string | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
}
