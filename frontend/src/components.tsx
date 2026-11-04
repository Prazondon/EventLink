import {
  ArrowDownRight,
  ArrowRight,
  Bookmark,
  Check,
  Compass,
  Heart,
  MapPin,
  Menu,
  Sparkles,
  Star,
  X,
} from "lucide-react";
import { useState } from "react";
import { Link, NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "./auth";
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
    <Link className={`brand${light ? " brand-light" : ""}`} to="/">
      <span className="brand-mark">
        <Sparkles size={17} strokeWidth={2.25} />
      </span>
      <span>eventlink</span>
    </Link>
  );
}

export function Header() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);

  async function handleSignOut() {
    await signOut();
    navigate("/");
  }

  return (
    <header className="site-header">
      <div className="nav-shell">
        <Brand />
        <nav className={`main-nav${menuOpen ? " main-nav-open" : ""}`}>
          <NavLink to="/discover" onClick={() => setMenuOpen(false)}>
            Discover
          </NavLink>
          <a href="/#how-it-works" onClick={() => setMenuOpen(false)}>
            How it works
          </a>
          {user?.role === "business" && (
            <NavLink to="/business" onClick={() => setMenuOpen(false)}>
              Business studio
            </NavLink>
          )}
          {user?.role === "admin" && (
            <NavLink to="/admin" onClick={() => setMenuOpen(false)}>
              Admin
            </NavLink>
          )}
        </nav>
        <div className="nav-actions">
          {user ? (
            <>
              {user.role === "customer" && (
                <Link className="nav-dashboard" to="/dashboard">
                  My EventLink
                </Link>
              )}
              <button className="avatar-button" onClick={handleSignOut} title="Sign out">
                {user.email.slice(0, 1).toUpperCase()}
              </button>
            </>
          ) : (
            <>
              <Link className="nav-login" to="/login">
                Log in
              </Link>
              <Link className="button button-dark button-small" to="/register">
                Join EventLink <ArrowRight size={15} />
              </Link>
            </>
          )}
        </div>
        <button
          className="mobile-menu-button"
          aria-label={menuOpen ? "Close menu" : "Open menu"}
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
        <div>
          <Brand light />
          <p>Good people make great celebrations.</p>
        </div>
        <div className="footer-links">
          <Link to="/discover">Explore professionals</Link>
          <Link to="/register?role=business">List your business</Link>
          <a href="/#how-it-works">How it works</a>
        </div>
        <div className="footer-note">Made for the moments that matter.</div>
      </div>
      <div className="footer-bottom">
        <span>© {new Date().getFullYear()} EventLink</span>
        <span>Thoughtful events start here.</span>
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
  return (
    <article className="business-card">
      <Link
        className="business-card-image"
        to={`/businesses/${business.business.id}`}
        style={{ backgroundImage: `url("${businessImage(business, index)}")` }}
        aria-label={`View ${business.business.business_name}`}
      >
        {business.profile.verification_status === "approved" && (
          <span className="verified-chip">
            <Check size={12} /> Verified
          </span>
        )}
      </Link>
      {onSave && (
        <button
          className={`save-button${saved ? " is-saved" : ""}`}
          onClick={() => onSave(business.business.id)}
          aria-label={saved ? "Remove from saved" : "Save business"}
        >
          {saved ? <Heart size={17} fill="currentColor" /> : <Bookmark size={17} />}
        </button>
      )}
      <div className="business-card-content">
        <div className="business-card-meta">
          <span>{business.profile.categories[0]?.name ?? "Event professional"}</span>
          <Stars rating={business.average_rating} count={business.review_count} />
        </div>
        <Link
          className="business-card-title"
          to={`/businesses/${business.business.id}`}
        >
          {business.business.business_name}
        </Link>
        <p className="business-card-location">
          <MapPin size={14} />
          {[business.business.location_city, business.business.location_country]
            .filter(Boolean)
            .join(", ") || "Location not listed"}
        </p>
        <p className="business-card-description">
          {business.profile.description || "A local professional ready to help bring your event to life."}
        </p>
        <Link
          className="business-card-link"
          to={`/businesses/${business.business.id}`}
        >
          View profile <ArrowRight size={15} />
        </Link>
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
