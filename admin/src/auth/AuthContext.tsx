import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { api, ApiUser, setToken } from '@/api/client';

type AuthState = {
  user: ApiUser | null;
  loading: boolean;
  login: (identifier: string, password: string) => Promise<void>;
  logout: () => void;
  hasPermission: (code: string) => boolean;
  /** المالك الرئيسي (super_admin) — يرى سعر الجملة */
  isOwner: boolean;
};

export function isDriverOnly(user: ApiUser | null) {
  if (!user) return false;
  const staff = user.roles.includes('super_admin') || user.roles.includes('admin');
  return user.roles.includes('delivery_agent') && !staff;
}

export function isBranchUser(user: ApiUser | null) {
  if (!user?.branch?.id) return false;
  const staff = user.roles.includes('super_admin') || user.roles.includes('admin');
  return !staff;
}

/** Facebook Page employee — restricted admin shell (not branch/driver/admin). */
export function isFacebookPageEmployee(user: ApiUser | null) {
  if (!user) return false;
  if (user.roles.includes('super_admin') || user.roles.includes('admin')) return false;
  if (user.branch?.id) return false;
  if (user.roles.includes('delivery_agent')) return false;
  return user.roles.includes('sales_agent');
}

export function homePath(user: ApiUser | null) {
  if (isDriverOnly(user)) return '/driver';
  if (isBranchUser(user)) return '/branch';
  if (isFacebookPageEmployee(user)) return '/staff-home';
  return '/';
}

export function detectLoginKind(raw: string): 'phone' | 'email' | 'username' {
  const value = raw.trim();
  if (!value) return 'username';
  if (value.includes('@')) return 'email';
  const compact = value.replace(/[\s-]/g, '');
  if (/^(\+?218|0)?9\d{8}$/.test(compact) || /^\d{8,15}$/.test(compact.replace(/\D/g, ''))) {
    return 'phone';
  }
  return 'username';
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<ApiUser | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const me = await api<ApiUser>('/auth/me');
      setUser(me);
    } catch (err) {
      const message = err instanceof Error ? err.message : '';
      const keepSession = /table|does not exist|P2021|Invalid/i.test(message);
      if (!keepSession) {
        setToken(null);
        setUser(null);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) {
      setLoading(false);
      return;
    }
    void refresh();
  }, [refresh]);

  const login = useCallback(async (identifier: string, password: string) => {
    const res = await api<{ accessToken: string; user: ApiUser }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ identifier: identifier.trim(), password }),
    });
    setToken(res.accessToken);
    setUser(res.user);
  }, []);

  const logout = useCallback(() => {
    setToken(null);
    setUser(null);
  }, []);

  const hasPermission = useCallback(
    (code: string) => {
      if (!user) return false;
      if (user.roles.includes('super_admin')) return true;
      return user.permissions.includes(code);
    },
    [user],
  );

  const isOwner = Boolean(user?.roles.includes('super_admin'));

  const value = useMemo(
    () => ({ user, loading, login, logout, hasPermission, isOwner }),
    [user, loading, login, logout, hasPermission, isOwner],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
