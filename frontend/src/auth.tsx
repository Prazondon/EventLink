import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { api } from "./api";
import type { User } from "./types";

const TOKEN_KEY = "eventlink.accessToken";

interface AuthValue {
  user: User | null;
  token: string | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<User>;
  signUpCustomer: (email: string, password: string, name: string) => Promise<void>;
  signUpBusiness: (
    email: string,
    password: string,
    name: string,
    city: string,
    country: string,
  ) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(() =>
    localStorage.getItem(TOKEN_KEY),
  );
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    if (!token) {
      setLoading(false);
      return () => {
        active = false;
      };
    }

    api
      .me(token)
      .then((currentUser) => {
        if (active) setUser(currentUser);
      })
      .catch(() => {
        if (!active) return;
        localStorage.removeItem(TOKEN_KEY);
        setToken(null);
        setUser(null);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [token]);

  const signIn = useCallback(async (email: string, password: string) => {
    const result = await api.login(email, password);
    localStorage.setItem(TOKEN_KEY, result.access_token);
    setToken(result.access_token);
    const currentUser = await api.me(result.access_token);
    setUser(currentUser);
    setLoading(false);
    return currentUser;
  }, []);

  const signUpCustomer = useCallback(
    async (email: string, password: string, name: string) => {
      await api.registerCustomer(email, password, name);
      await signIn(email, password);
    },
    [signIn],
  );

  const signUpBusiness = useCallback(
    async (
      email: string,
      password: string,
      name: string,
      city: string,
      country: string,
    ) => {
      await api.registerBusiness(email, password, name, city, country);
      await signIn(email, password);
    },
    [signIn],
  );

  const signOut = useCallback(async () => {
    if (token) {
      try {
        await api.logout(token);
      } finally {
        localStorage.removeItem(TOKEN_KEY);
        setToken(null);
        setUser(null);
      }
      return;
    }
    localStorage.removeItem(TOKEN_KEY);
    setToken(null);
    setUser(null);
  }, [token]);

  const value = useMemo(
    () => ({ user, token, loading, signIn, signUpCustomer, signUpBusiness, signOut }),
    [user, token, loading, signIn, signUpCustomer, signUpBusiness, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used inside AuthProvider.");
  return value;
}
