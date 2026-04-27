import { createContext, useCallback, useEffect, useMemo, useReducer, ReactNode } from 'react';
import { User } from '@/types/auth';
import { authApi } from '@/api/auth';

interface AuthState {
  user: User | null;
  token: string | null;
  loading: boolean;
  error: string | null;
}

type AuthAction =
  | { type: 'AUTH_START' }
  | { type: 'AUTH_SUCCESS'; user: User; token: string }
  | { type: 'AUTH_LOADED'; user: User }
  | { type: 'AUTH_ERROR'; error: string }
  | { type: 'AUTH_LOGOUT' };

function authReducer(state: AuthState, action: AuthAction): AuthState {
  switch (action.type) {
    case 'AUTH_START':
      return { ...state, loading: true, error: null };
    case 'AUTH_SUCCESS':
      return { user: action.user, token: action.token, loading: false, error: null };
    case 'AUTH_LOADED':
      return { ...state, user: action.user, loading: false, error: null };
    case 'AUTH_ERROR':
      return { user: null, token: null, loading: false, error: action.error };
    case 'AUTH_LOGOUT':
      return { user: null, token: null, loading: false, error: null };
    default:
      return state;
  }
}

export interface AuthContextType {
  user: User | null;
  loading: boolean;
  error: string | null;
  isAuthenticated: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
}

export const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const params = new URLSearchParams(window.location.search);
  const isDemoMode = params.get('demo') === '1';
  const savedToken = localStorage.getItem('auth_token');

  const [state, dispatch] = useReducer(authReducer, {
    user: null,
    token: savedToken,
    loading: !!savedToken || isDemoMode,
    error: null,
  });

  // On mount: demo auto-login or validate existing token
  useEffect(() => {
    if (isDemoMode && !savedToken) {
      const backend = import.meta.env.VITE_API_BASE_URL || '';
      fetch(`${backend}/api/v1/auth/demo-token`)
        .then((r) => r.json())
        .then((data) => {
          if (data.access_token) {
            localStorage.setItem('auth_token', data.access_token);
            window.location.href = '/haccp';
          } else {
            dispatch({ type: 'AUTH_ERROR', error: 'Demo mode unavailable' });
          }
        })
        .catch(() => {
          dispatch({ type: 'AUTH_ERROR', error: 'Demo mode unavailable' });
        });
      return;
    }

    if (!savedToken) return;

    authApi.getMe()
      .then((user) => dispatch({ type: 'AUTH_LOADED', user }))
      .catch(() => {
        localStorage.removeItem('auth_token');
        dispatch({ type: 'AUTH_ERROR', error: '會話已過期，請重新登入' });
      });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const login = useCallback(async (username: string, password: string) => {
    dispatch({ type: 'AUTH_START' });
    try {
      const tokenResponse = await authApi.login(username, password);
      localStorage.setItem('auth_token', tokenResponse.access_token);

      const user = await authApi.getMe();
      dispatch({ type: 'AUTH_SUCCESS', user, token: tokenResponse.access_token });
    } catch (err: unknown) {
      const message = (err as { response?: { data?: { detail?: string } } })
        ?.response?.data?.detail || '登入失敗，請檢查帳號密碼';
      dispatch({ type: 'AUTH_ERROR', error: message });
      throw new Error(message);
    }
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem('auth_token');
    dispatch({ type: 'AUTH_LOGOUT' });
  }, []);

  const value = useMemo<AuthContextType>(() => ({
    user: state.user,
    loading: state.loading,
    error: state.error,
    isAuthenticated: !!state.user && !!state.token,
    login,
    logout,
  }), [state.user, state.loading, state.error, state.token, login, logout]);

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}
