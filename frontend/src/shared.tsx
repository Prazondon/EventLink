import { ArrowRight, Heart, Sparkles } from "lucide-react";
import { type ReactNode, useCallback, useEffect, useState } from "react";
import { Link, Navigate, useLocation } from "react-router-dom";
import { useAuth } from "./auth";
import { DashboardSidebar, Loading, Notice } from "./components";
import type { UserRole } from "./types";

export function useResource<T>(
  load: () => Promise<T>,
  dependencies: readonly unknown[],
) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const reload = useCallback(() => setRevision((value) => value + 1), []);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    load()
      .then((value) => {
        if (active) setData(value);
      })
      .catch((reason: unknown) => {
        if (active) setError(errorMessage(reason));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [...dependencies, revision]);

  return { data, loading, error, reload };
}

export function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Something went wrong. Please try again.";
}

export function useSubmission() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  async function submit(action: () => Promise<unknown>, message: string) {
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      await action();
      setSuccess(message);
      return true;
    } catch (reason) {
      setError(errorMessage(reason));
      return false;
    } finally {
      setBusy(false);
    }
  }
  return { busy, error, success, setError, setSuccess, submit };
}

export function Feedback({ error, success }: { error: string; success: string }) {
  return (
    <>
      {error && <Notice>{error}</Notice>}
      {success && <Notice tone="success">{success}</Notice>}
    </>
  );
}

export function loginPath(next: string) {
  return `/login?next=${encodeURIComponent(next)}`;
}

export /** Only same-app paths are honoured, so `?next=` cannot send people off-site. */
function safeNext(value: string | null) {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) return null;
  return value;
}

export function roleHome(role: UserRole) {
  return role === "business" ? "/business" : role === "admin" ? "/admin" : "/dashboard";
}

export function StatCard({ value, label, icon, to }: { value: number; label: string; icon: ReactNode; to: string }) {
  return <Link className="stat-card" to={to}><span className="stat-icon">{icon}</span><strong>{value}</strong><span>{label}</span><ArrowRight className="stat-arrow" size={16} /></Link>;
}

export function AuthShell({ children, title, subtitle }: { children: ReactNode; title: string; subtitle: string }) {
  return <div className="auth-page"><div className="auth-card"><span className="auth-mark"><Sparkles size={20} /></span><span className="eyebrow">EVENTLINK</span><h1>{title}</h1><p className="auth-subtitle">{subtitle}</p>{children}</div><div className="auth-aside"><span className="eyebrow eyebrow-light">Good things begin with people</span><h2>Make your next celebration feel like <em>you.</em></h2><p>Discover event professionals who bring care, creativity, and a little magic to every detail.</p><div className="auth-aside-icon"><Heart size={20} fill="currentColor" /></div></div></div>;
}

export function Protected({
  role,
  children,
}: {
  role: UserRole;
  children: ReactNode;
}) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <Loading label="Preparing your EventLink..." />;
  if (!user) return <Navigate to={`/login/${role}?next=${encodeURIComponent(location.pathname + location.search)}`} replace />;
  if (user.role !== role) {
    const destination =
      user.role === "business" ? "/business" : user.role === "admin" ? "/admin" : "/dashboard";
    return <Navigate to={destination} replace />;
  }
  return <>{children}</>;
}

export function CustomerLayout({
  active,
  children,
}: {
  active: string;
  children: ReactNode;
}) {
  const { user } = useAuth();
  return (
    <div className="workspace-shell">
      <DashboardSidebar role="customer" active={active} name={user?.email ?? "Member"} />
      <main className="workspace-content">{children}</main>
    </div>
  );
}

export function BusinessLayout({
  active,
  children,
}: {
  active: string;
  children: ReactNode;
}) {
  const { user } = useAuth();
  return (
    <div className="workspace-shell">
      <DashboardSidebar role="business" active={active} name={user?.email ?? "Business"} />
      <main className="workspace-content">{children}</main>
    </div>
  );
}

export function AdminLayout({
  active,
  children,
}: {
  active: string;
  children: ReactNode;
}) {
  const { user } = useAuth();
  return (
    <div className="workspace-shell">
      <DashboardSidebar role="admin" active={active} name={user?.email ?? "Administrator"} />
      <main className="workspace-content">{children}</main>
    </div>
  );
}
