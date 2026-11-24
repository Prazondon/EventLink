import {
  ArrowDownRight,
  ArrowRight,
  Bookmark,
  Check,
  Compass,
  Heart,
  LogOut,
  Menu,
  Sparkles,
  Star,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "./auth";
import { RoomIndex, RunningOrderTicket } from "./Landing";
import type { PublicBusiness } from "./types";

export const categoryArt: Record<string, string> = {
  "venues":
    "https://images.unsplash.com/photo-1519167758481-83f550bb49b3?auto=format&fit=crop&w=800&q=85",
  "photography":
    "https://images.unsplash.com/photo-1537633552985-df8429e8048b?auto=format&fit=crop&w=800&q=85",
  "catering":
    "https://images.unsplash.com/photo-1555244162-803834f70033?auto=format&fit=crop&w=800&q=85",
  "florists":
    "https://images.unsplash.com/photo-1523438885200-e635ba2c371e?auto=format&fit=crop&w=800&q=85",
  "music":
    "https://images.unsplash.com/photo-1501386761578-eac5c94b800a?auto=format&fit=crop&w=800&q=85",
  "planning":
    "https://images.unsplash.com/photo-1464366400600-7168b8af9bc3?auto=format&fit=crop&w=800&q=85",
};

const cardArt = [
  "https://images.unsplash.com/photo-1519167758481-83f550bb49b3?auto=format&fit=crop&w=900&q=85",
  "https://images.unsplash.com/photo-1537633552985-df8429e8048b?auto=format&fit=crop&w=900&q=85",
  "https://images.unsplash.com/photo-1555244162-803834f70033?auto=format&fit=crop&w=900&q=85",
  "https://images.unsplash.com/photo-1523438885200-e635ba2c371e?auto=format&fit=crop&w=900&q=85",
];

export function businessImage(business: PublicBusiness, index = 0) {
  const portfolio = business.profile.portfolio_images[0]?.image_url;
  if (portfolio) return portfolio;
  const category = business.profile.categories[0]?.name.toLowerCase() ?? "";
  const matchingCategory = Object.keys(categoryArt).find((key) =>
    category.includes(key),
  );
  return matchingCategory ? categoryArt[matchingCategory] : cardArt[index % cardArt.length];
}

export function Brand({ light = false }: { light?: boolean }) {
  return (
    <Link className={`brand${light ? " brand-light" : ""}`} to="/" aria-label="EventLink home">
      <span className="brand-mark" aria-hidden="true" />
      <span>eventlink</span>
    </Link>
  );
}

export function Header() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const onLanding = pathname === "/";
  const [menuOpen, setMenuOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const accountRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMenuOpen(false);
    setAccountOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!accountOpen) return;
    const close = (event: MouseEvent | KeyboardEvent) => {
      if (event instanceof KeyboardEvent ? event.key === "Escape" : !accountRef.current?.contains(event.target as Node)) {
        setAccountOpen(false);
      }
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [accountOpen]);

  async function handleSignOut() {
    setAccountOpen(false);
    setMenuOpen(false);
    await signOut();
    navigate("/");
  }

  const home = user?.role === "business" ? "/business" : user?.role === "admin" ? "/admin" : "/dashboard";
  const homeLabel = user?.role === "business" ? "Business studio" : user?.role === "admin" ? "Admin" : "My EventLink";

  return (
    <header className={`site-header${onLanding ? " site-header--gallery" : ""}`}>
      <div className="nav-shell">
        <Brand light />
        <nav className={`main-nav${menuOpen ? " main-nav-open" : ""}`} aria-label={onLanding ? "Rooms" : "Main"}>
          {onLanding ? (
            <RoomIndex onNavigate={() => setMenuOpen(false)} />
          ) : (
            <>
              <NavLink to="/discover">Discover</NavLink>
              <Link to="/#how-it-works">How it works</Link>
            </>
          )}
          <div className="main-nav-auth">
            {user ? (
              <>
                <Link to={home}>{homeLabel}</Link>
                <button type="button" onClick={handleSignOut}>Sign out</button>
              </>
            ) : (
              <>
                <Link to="/login">Log in</Link>
                <Link to="/register">Join EventLink</Link>
              </>
            )}
          </div>
        </nav>
        {onLanding && <RunningOrderTicket />}
        <div className="nav-actions">
          {user ? (
            <>
              <Link className="nav-dashboard" to={home}>{homeLabel}</Link>
              <div className="account" ref={accountRef}>
                <button
                  type="button"
                  className="avatar-button"
                  aria-haspopup="menu"
                  aria-expanded={accountOpen}
                  aria-label={`Account menu for ${user.email}`}
                  onClick={() => setAccountOpen(!accountOpen)}
                >
                  {user.email.slice(0, 1).toUpperCase()}
                </button>
                {accountOpen && (
                  <div className="account-menu" role="menu">
                    <span className="account-email">{user.email}</span>
                    <Link role="menuitem" to={home}>{homeLabel}</Link>
                    <button role="menuitem" type="button" onClick={handleSignOut}><LogOut size={15} /> Sign out</button>
                  </div>
                )}
              </div>
            </>
          ) : (
            <>
              <Link className="nav-login" to="/login">Log in</Link>
              <Link className="button button-accent button-small" to="/register">Join EventLink</Link>
            </>
          )}
        </div>
        <button
          type="button"
          className="mobile-menu-button"
          aria-label={menuOpen ? "Close menu" : "Open menu"}
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen(!menuOpen)}
        >
          {menuOpen ? <X size={21} /> : <Menu size={21} />}
        </button>
      </div>
    </header>
  );
}

export function Footer() {
  return (
    <footer className="site-footer">
      <div className="footer-main">
        <div className="footer-brand">
          <Brand light />
          <p>Local event professionals, verified and easy to reach.</p>
        </div>
        <nav className="footer-links" aria-label="Footer">
          <Link to="/discover">Find your people</Link>
          <Link to="/register?role=business">List your business</Link>
          <Link to="/#how-it-works">How it works</Link>
        </nav>
      </div>
      <div className="footer-bottom">
        <span>© {new Date().getFullYear()} EventLink</span>
        <span>Photography via Unsplash</span>
      </div>
    </footer>
  );
}

export function Stars({ rating, count }: { rating: number; count?: number }) {
  return (
    <span className="rating-inline">
      <Star size={15} fill="currentColor" />
      <strong>{rating > 0 ? rating.toFixed(1) : "New"}</strong>
      {count !== undefined && <span className="rating-count">({count})</span>}
    </span>
  );
}

export function BusinessCard({
  business,
  index = 0,
  saved = false,
  onSave,
}: {
  business: PublicBusiness;
  index?: number;
  saved?: boolean;
  onSave?: (id: string) => void;
}) {
  const href = `/businesses/${business.business.id}`;
  const location = [business.business.location_city, business.business.location_country]
    .filter(Boolean)
    .join(", ");
  return (
    <article className="business-card">
      <Link className="business-card-image" to={href} tabIndex={-1} aria-hidden="true">
        <img src={businessImage(business, index)} alt="" loading="lazy" decoding="async" />
      </Link>
      {onSave && (
        <button
          type="button"
          className={`save-button${saved ? " is-saved" : ""}`}
          onClick={() => onSave(business.business.id)}
          aria-pressed={saved}
          aria-label={saved ? `Remove ${business.business.business_name} from saved` : `Save ${business.business.business_name}`}
        >
          {saved ? <Heart size={17} fill="currentColor" /> : <Bookmark size={17} />}
        </button>
      )}
      <div className="business-card-content">
        <Link className="business-card-title" to={href}>
          {business.business.business_name}
        </Link>
        <dl className="business-card-meta">
          <div><dt>Room</dt><dd>{business.profile.categories[0]?.name ?? "Event professional"}</dd></div>
          <div><dt>Where</dt><dd>{location || "Location not listed"}</dd></div>
          <div><dt>Rating</dt><dd><Stars rating={business.average_rating} count={business.review_count} /></dd></div>
        </dl>
        {business.profile.verification_status === "approved" && (
          <span className="verified-chip"><Check size={12} /> Verified</span>
        )}
      </div>
    </article>
  );
}

export function PageHeading({
  eyebrow,
  title,
  subtitle,
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
}) {
  return (
    <div className="page-heading">
      {eyebrow && <span className="eyebrow">{eyebrow}</span>}
      <h1>{title}</h1>
      {subtitle && <p>{subtitle}</p>}
    </div>
  );
}

export function Loading({ label = "Loading..." }: { label?: string }) {
  return (
    <div className="loading-state" role="status">
      <span className="spinner" />
      {label}
    </div>
  );
}

export function Notice({
  children,
  tone = "error",
}: {
  children: React.ReactNode;
  tone?: "error" | "success" | "info";
}) {
  return <div className={`notice notice-${tone}`}>{children}</div>;
}

export function EmptyState({
  icon = <Compass size={23} />,
  title,
  children,
  action,
}: {
  icon?: React.ReactNode;
  title: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="empty-state">
      <span className="empty-icon">{icon}</span>
      <h3>{title}</h3>
      <p>{children}</p>
      {action}
    </div>
  );
}

export function DashboardSidebar({
  role,
  active,
  name,
}: {
  role: "customer" | "business" | "admin";
  active: string;
  name: string;
}) {
  const links =
    role === "customer"
      ? [
          { to: "/dashboard", label: "Overview", icon: <Compass size={17} /> },
          { to: "/saved", label: "Saved businesses", icon: <Heart size={17} /> },
          { to: "/recommendations", label: "For you", icon: <Sparkles size={17} /> },
          { to: "/profile", label: "Your profile", icon: <ArrowDownRight size={17} /> },
        ]
      : role === "business"
        ? [
            { to: "/business", label: "Overview", icon: <Compass size={17} /> },
            { to: "/business/profile", label: "Your listing", icon: <ArrowDownRight size={17} /> },
          ]
        : [
            { to: "/admin", label: "Verification queue", icon: <Check size={17} /> },
          ];

  return (
    <aside className="dashboard-sidebar">
      <div className="sidebar-user">
        <span className="sidebar-avatar">{name.slice(0, 1).toUpperCase() || "E"}</span>
        <span>
          <strong>{name}</strong>
          <small>{role === "business" ? "Business studio" : `${role} account`}</small>
        </span>
      </div>
      <div className="sidebar-label">WORKSPACE</div>
      <nav className="sidebar-nav">
        {links.map((link) => (
          <NavLink
            key={link.to}
            to={link.to}
            className={active === link.to ? "sidebar-link sidebar-link-active" : "sidebar-link"}
          >
            {link.icon}
            {link.label}
            {active === link.to && <ArrowRight className="sidebar-link-arrow" size={15} />}
          </NavLink>
        ))}
      </nav>
      <Link className="sidebar-explore" to="/discover">
        <Compass size={16} /> Explore EventLink
      </Link>
    </aside>
  );
}

export function SectionTitle({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="section-title-row">
      <div>
        <h2>{title}</h2>
        {description && <p>{description}</p>}
      </div>
      {action}
    </div>
  );
}
