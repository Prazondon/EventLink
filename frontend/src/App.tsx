import {
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  Bookmark,
  Check,
  ChevronDown,
  CircleHelp,
  Heart,
  Mail,
  MapPin,
  Plus,
  Search,
  ShieldCheck,
  Sparkles,
  Star,
  Trash2,
  Users,
} from "lucide-react";
import {
  type FormEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  Link,
  Navigate,
  Route,
  Routes,
  useNavigate,
  useLocation,
  useParams,
  useSearchParams,
} from "react-router-dom";
import { api } from "./api";
import { useAuth } from "./auth";
import LandingPage from "./Landing";
import {
  BusinessCard,
  DashboardSidebar,
  EmptyState,
  Footer,
  Header,
  Loading,
  Notice,
  PageHeading,
  SectionTitle,
  Stars,
  businessImage,
} from "./components";
import type {
  BusinessDashboardData,
  Category,
  PublicBusiness,
  Review,
  UserRole,
  VerificationRequest,
} from "./types";

function useResource<T>(
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

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Something went wrong. Please try again.";
}

function useSubmission() {
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

function Feedback({ error, success }: { error: string; success: string }) {
  return (
    <>
      {error && <Notice>{error}</Notice>}
      {success && <Notice tone="success">{success}</Notice>}
    </>
  );
}

function Protected({
  role,
  children,
}: {
  role: UserRole;
  children: ReactNode;
}) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <Loading label="Preparing your EventLink..." />;
  if (!user) return <Navigate to={loginPath(location.pathname + location.search)} replace />;
  if (user.role !== role) {
    const destination =
      user.role === "business" ? "/business" : user.role === "admin" ? "/admin" : "/dashboard";
    return <Navigate to={destination} replace />;
  }
  return <>{children}</>;
}

function CustomerLayout({
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

function BusinessLayout({
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

function AdminLayout({
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

function DiscoverPage() {
  // The URL is the single source of truth for applied filters, so links such as
  // "/discover?category_id=..." and the back button always show what they say.
  const [searchParams, setSearchParams] = useSearchParams();
  const applied = searchParams.toString();
  const [categories, setCategories] = useState<Category[]>([]);
  const [businesses, setBusinesses] = useState<PublicBusiness[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState(searchParams.get("q") ?? "");
  const [city, setCity] = useState(searchParams.get("city") ?? "");
  const categoryId = searchParams.get("category_id") ?? "";
  const sort = searchParams.get("sort") ?? "rating";
  const { user, token } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const [saveError, setSaveError] = useState("");

  useEffect(() => {
    setQuery(searchParams.get("q") ?? "");
    setCity(searchParams.get("city") ?? "");
  }, [applied]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    let active = true;
    const params = new URLSearchParams(applied);
    if (!params.has("sort")) params.set("sort", "rating");
    setLoading(true);
    setError("");
    api.businesses(params)
      .then((results) => { if (active) setBusinesses(results); })
      .catch((reason: unknown) => { if (active) setError(errorMessage(reason)); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [applied]);

  function applyFilters(changes: Record<string, string>) {
    const next = new URLSearchParams(searchParams);
    for (const [key, value] of Object.entries(changes)) {
      if (value.trim()) next.set(key, value.trim());
      else next.delete(key);
    }
    setSearchParams(next, { replace: true });
  }

  useEffect(() => {
    api.categories().then(setCategories).catch((reason: unknown) => setError(errorMessage(reason)));
  }, []);

  useEffect(() => {
    if (!token || user?.role !== "customer") return;
    api.savedBusinesses(token)
      .then((items) => setSavedIds(new Set(items.map((item) => item.business.business.id))))
      .catch((reason: unknown) => setSaveError(errorMessage(reason)));
  }, [token, user?.role]);

  async function toggleSave(id: string) {
    if (!token) {
      navigate(loginPath(location.pathname + location.search));
      return;
    }
    if (user?.role !== "customer") {
      setSaveError("Saving professionals is available on customer accounts.");
      return;
    }
    setSaveError("");
    try {
      if (savedIds.has(id)) await api.unsaveBusiness(id, token);
      else await api.saveBusiness(id, token);
      setSavedIds((current) => {
        const next = new Set(current);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      });
    } catch (reason) {
      setSaveError(errorMessage(reason));
    }
  }

  function submitSearch(event: FormEvent) {
    event.preventDefault();
    applyFilters({ q: query, city });
  }

  return (
    <div className="page-wrap discover-page">
      <PageHeading eyebrow="Your people are out there" title="Find the right kind of wonderful." subtitle="Search local event professionals and save the ones who feel just right." />
      <form className="search-panel" onSubmit={submitSearch}>
        <label className="field search-field"><span>What are you looking for?</span><span className="input-with-icon"><Search size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Venue, flowers, photography..." /></span></label>
        <label className="field search-field"><span>Where?</span><span className="input-with-icon"><MapPin size={17} /><input value={city} onChange={(event) => setCity(event.target.value)} placeholder="City or town" /></span></label>
        <label className="field search-field"><span>Kind of professional</span><span className="select-wrap"><select value={categoryId} onChange={(event) => applyFilters({ category_id: event.target.value })}><option value="">All categories</option>{categories.map((category) => <option value={category.id} key={category.id}>{category.name}</option>)}</select><ChevronDown size={16} /></span></label>
        <button className="button button-dark search-submit" type="submit"><Search size={17} /> Search</button>
      </form>
      <div className="results-toolbar">
        <span>{loading ? "Finding your people..." : `${businesses.length} ${businesses.length === 1 ? "professional" : "professionals"} to explore`}</span>
        <label className="sort-select">Sort by <select value={sort} onChange={(event) => applyFilters({ sort: event.target.value })}><option value="rating">Top rated</option><option value="newest">Recently added</option><option value="name">Name</option></select></label>
      </div>
      {saveError && <Notice>{saveError}</Notice>}
      {error && <Notice>{error}</Notice>}
      {loading ? <Loading label="Finding event professionals..." /> : null}
      {!loading && businesses.length > 0 && <div className="business-grid">{businesses.map((business, index) => <BusinessCard business={business} index={index} key={business.business.id} saved={savedIds.has(business.business.id)} onSave={toggleSave} />)}</div>}
      {!loading && !error && businesses.length === 0 && <EmptyState icon={<Search size={24} />} title="No matches just yet">Try a nearby city, a different search, or clear a category filter.</EmptyState>}
    </div>
  );
}

function BusinessDetailsPage() {
  const { id = "" } = useParams();
  const { user, token } = useAuth();
  const business = useResource(() => api.business(id), [id]);
  const reviews = useResource(() => api.reviews(id), [id]);
  const [rating, setRating] = useState("5");
  const [comment, setComment] = useState("");
  const contactAction = useSubmission();
  const reviewAction = useSubmission();
  const navigate = useNavigate();
  const location = useLocation();

  // Business dashboards report "profile views", but nothing ever recorded one.
  // Log a view once per visit for signed-in customers (consented by signing in).
  const isCustomer = user?.role === "customer";
  const viewRecorded = useRef("");
  useEffect(() => {
    if (!token || !isCustomer || !id || viewRecorded.current === id) return;
    viewRecorded.current = id;
    api.recordView(id, token).catch(() => undefined);
  }, [id, token, isCustomer]);

  async function contact() {
    if (!token) {
      navigate(loginPath(location.pathname));
      return;
    }
    if (!isCustomer) {
      contactAction.setError("Contacting professionals is available on customer accounts.");
      return;
    }
    await contactAction.submit(() => api.contactBusiness(id, token), "Your interest has been shared with this professional.");
  }

  async function review(event: FormEvent) {
    event.preventDefault();
    if (!token) return;
    const done = await reviewAction.submit(() => api.createReview(id, Number(rating), comment, token), "Thank you for sharing your review.");
    if (done) {
      setComment("");
      reviews.reload();
    }
  }

  if (business.loading) return <Loading label="Opening this listing..." />;
  if (business.error) return <div className="page-wrap"><Notice>{business.error}</Notice><Link className="text-link" to="/discover"><ArrowLeft size={16} /> Back to discover</Link></div>;
  if (!business.data) return null;
  const item = business.data;
  const gallery = item.profile.portfolio_images;

  return (
    <div className="page-wrap detail-page">
      <Link className="back-link" to="/discover"><ArrowLeft size={16} /> Back to discover</Link>
      <section className="detail-hero">
        <div className="detail-main-image" style={{ backgroundImage: `url("${gallery[0]?.image_url || businessImage(item)}")` }} />
        <div className="detail-title-card">
          <span className="eyebrow">{item.profile.categories.map((category) => category.name).join(" · ") || "Event professional"}</span>
          <h1>{item.business.business_name}</h1>
          <p className="business-card-location"><MapPin size={15} /> {[item.business.location_city, item.business.location_country].filter(Boolean).join(", ") || "Location not listed"}</p>
          <Stars rating={item.average_rating} count={item.review_count} />
          {item.profile.verification_status === "approved" && <span className="verified-line"><BadgeCheck size={16} /> Verified professional</span>}
        </div>
      </section>
      <div className="detail-layout">
        <div className="detail-copy">
          <section className="detail-section"><span className="eyebrow">A little about them</span><h2>Thoughtful work, made personal.</h2><p>{item.profile.description || "This professional is ready to help make your event special. Get in touch to learn more about their work."}</p></section>
          {item.profile.services.length > 0 && <section className="detail-section"><SectionTitle title="Services" description="A few ways they can make your event feel like yours." /><div className="service-list">{item.profile.services.map((service) => <article className="service-row" key={service.id}><div><strong>{service.name}</strong><p>{service.description || "Available by request"}</p></div><span>{service.price ? `${service.currency} ${service.price}` : "Ask for pricing"}</span></article>)}</div></section>}
          {gallery.length > 0 && <section className="detail-section"><SectionTitle title="A glimpse of their work" /><div className="portfolio-grid">{gallery.map((image) => <figure key={image.id}><img src={image.image_url} alt={image.caption || `${item.business.business_name} portfolio`} /><figcaption>{image.caption}</figcaption></figure>)}</div></section>}
          <section className="detail-section reviews-section">
            <SectionTitle title="Kind words" description={reviews.data ? `${reviews.data.total} reviews · ${reviews.data.average_rating.toFixed(1)} average rating` : "Reviews from the community"} />
            {reviews.error && <Notice>{reviews.error}</Notice>}
            {reviews.loading ? <Loading label="Loading reviews..." /> : reviews.data?.items.length ? <div className="review-list">{reviews.data.items.map((entry) => <ReviewRow key={entry.id} review={entry} />)}</div> : <p className="muted-copy">No reviews yet. Be the first to share your experience.</p>}
            {user?.role === "customer" && <form className="review-form" onSubmit={review}><h3>Share your experience</h3><div className="form-grid"><label className="field"><span>Your rating</span><select value={rating} onChange={(event) => setRating(event.target.value)}>{[5, 4, 3, 2, 1].map((value) => <option key={value} value={value}>{value} stars</option>)}</select></label><label className="field field-wide"><span>Your review</span><textarea rows={3} value={comment} onChange={(event) => setComment(event.target.value)} placeholder="What should others know?" /></label></div><Feedback error={reviewAction.error} success={reviewAction.success} /><button className="button button-dark" disabled={reviewAction.busy}>{reviewAction.busy ? "Sending..." : "Post review"} <ArrowRight size={16} /></button></form>}
          </section>
        </div>
        <aside className="contact-card">
          <span className="eyebrow">Make a connection</span><h2>Could this be<br />your person?</h2><p>Reach out to start a conversation about your celebration.</p>
          {item.business.contact_email && <p className="contact-detail"><Mail size={16} /> {item.business.contact_email}</p>}
          {item.business.contact_phone && <p className="contact-detail">{item.business.contact_phone}</p>}
          <button className="button button-dark button-full" onClick={contact} disabled={contactAction.busy}>I’m interested <ArrowRight size={16} /></button>
          <Feedback error={contactAction.error} success={contactAction.success} />
          <small><ShieldCheck size={14} /> Your details are shared with your consent.</small>
        </aside>
      </div>
    </div>
  );
}

function ReviewRow({ review }: { review: Review }) {
  return <article className="review-row"><div className="review-row-top"><Stars rating={review.rating} /><time>{new Date(review.created_at).toLocaleDateString()}</time></div><p>{review.comment_text || "A lovely experience."}</p></article>;
}

function AuthShell({ children, title, subtitle }: { children: ReactNode; title: string; subtitle: string }) {
  return <div className="auth-page"><div className="auth-card"><span className="auth-mark"><Sparkles size={20} /></span><span className="eyebrow">EVENTLINK</span><h1>{title}</h1><p className="auth-subtitle">{subtitle}</p>{children}</div><div className="auth-aside"><span className="eyebrow eyebrow-light">Good things begin with people</span><h2>Make your next celebration feel like <em>you.</em></h2><p>Discover event professionals who bring care, creativity, and a little magic to every detail.</p><div className="auth-aside-icon"><Heart size={20} fill="currentColor" /></div></div></div>;
}

function LoginPage() {
  const { signIn, user } = useAuth();
  const [searchParams] = useSearchParams();
  const action = useSubmission();
  // Signing in sets `user`, which re-renders straight into this redirect.
  if (user) return <Navigate to={safeNext(searchParams.get("next")) ?? roleHome(user.role)} replace />;
  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await action.submit(() => signIn(String(form.get("email")), String(form.get("password"))), "Welcome back.");
  }
  return <AuthShell title="Welcome back." subtitle="Sign in to pick up where you left off."><form className="auth-form" onSubmit={handleSubmit}><label className="field"><span>Email address</span><input type="email" name="email" autoComplete="email" required placeholder="you@example.com" /></label><label className="field"><span>Password</span><input type="password" name="password" autoComplete="current-password" required placeholder="Your password" /></label><div className="auth-helper"><Link to="/forgot-password">Forgot password?</Link></div><Feedback error={action.error} success={action.success} /><button className="button button-dark button-full" disabled={action.busy}>{action.busy ? "Signing in..." : "Sign in"} <ArrowRight size={16} /></button><p className="auth-switch">New to EventLink? <Link to="/register">Create an account</Link></p></form></AuthShell>;
}

function loginPath(next: string) {
  return `/login?next=${encodeURIComponent(next)}`;
}

/** Only same-app paths are honoured, so `?next=` cannot send people off-site. */
function safeNext(value: string | null) {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) return null;
  return value;
}

function roleHome(role: UserRole) {
  return role === "business" ? "/business" : role === "admin" ? "/admin" : "/dashboard";
}

function RegisterPage() {
  const { signUpCustomer, signUpBusiness, user } = useAuth();
  const [searchParams] = useSearchParams();
  const [role, setRole] = useState<"customer" | "business">(searchParams.get("role") === "business" ? "business" : "customer");
  const action = useSubmission();
  // New businesses land on their listing editor; everyone else on their home.
  if (user) return <Navigate to={user.role === "business" ? "/business/profile" : safeNext(searchParams.get("next")) ?? roleHome(user.role)} replace />;
  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email"));
    const password = String(form.get("password"));
    const name = String(form.get("name"));
    const task = role === "customer"
      ? () => signUpCustomer(email, password, name)
      : () => signUpBusiness(email, password, name, String(form.get("city") || ""), String(form.get("country") || ""));
    await action.submit(task, "Your account is ready.");
  }
  return <AuthShell title="Good things start here." subtitle="Create your free EventLink account."><div className="role-tabs"><button type="button" className={role === "customer" ? "role-tab selected" : "role-tab"} onClick={() => setRole("customer")}><Users size={16} /> I’m planning an event</button><button type="button" className={role === "business" ? "role-tab selected" : "role-tab"} onClick={() => setRole("business")}><Sparkles size={16} /> I’m a professional</button></div><form className="auth-form" onSubmit={handleSubmit}><label className="field"><span>{role === "business" ? "Business name" : "Your name"}</span><input name="name" required maxLength={role === "business" ? 200 : 150} placeholder={role === "business" ? "The name of your business" : "Your full name"} /></label>{role === "business" && <div className="form-grid"><label className="field"><span>City</span><input name="city" maxLength={120} placeholder="City" /></label><label className="field"><span>Country</span><input name="country" maxLength={120} placeholder="Country" /></label></div>}<label className="field"><span>Email address</span><input type="email" name="email" autoComplete="email" required placeholder="you@example.com" /></label><label className="field"><span>Password</span><input type="password" name="password" autoComplete="new-password" minLength={10} maxLength={128} required placeholder="At least 10 characters" /><small>Use at least 10 characters.</small></label><Feedback error={action.error} success={action.success} /><button className="button button-dark button-full" disabled={action.busy}>{action.busy ? "Creating account..." : "Create account"} <ArrowRight size={16} /></button><p className="auth-switch">Already with us? <Link to="/login">Sign in</Link></p></form></AuthShell>;
}

function ForgotPasswordPage() {
  const action = useSubmission();
  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const email = String(new FormData(event.currentTarget).get("email"));
    await action.submit(() => api.requestPasswordReset(email), "If an account exists for that email, reset instructions have been sent.");
  }
  return <AuthShell title="A fresh start." subtitle="We’ll send a reset link if there’s an account with that email."><form className="auth-form" onSubmit={handleSubmit}><label className="field"><span>Email address</span><input type="email" name="email" required placeholder="you@example.com" /></label><Feedback error={action.error} success={action.success} /><button className="button button-dark button-full" disabled={action.busy}>{action.busy ? "Sending..." : "Send reset link"} <ArrowRight size={16} /></button><p className="auth-switch"><Link to="/login">Back to sign in</Link></p></form></AuthShell>;
}

function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const action = useSubmission();
  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const password = String(new FormData(event.currentTarget).get("password"));
    await action.submit(() => api.resetPassword(searchParams.get("token") ?? "", password), "Password updated. You can now sign in.");
  }
  return <AuthShell title="Choose a new password." subtitle="Make it at least 10 characters long."><form className="auth-form" onSubmit={handleSubmit}><label className="field"><span>New password</span><input type="password" name="password" minLength={10} maxLength={128} required /></label><Feedback error={action.error || (!searchParams.get("token") ? "The reset token is missing from this link." : "")} success={action.success} /><button className="button button-dark button-full" disabled={action.busy || !searchParams.get("token")}>{action.busy ? "Updating..." : "Update password"} <ArrowRight size={16} /></button><p className="auth-switch"><Link to="/login">Back to sign in</Link></p></form></AuthShell>;
}

function CustomerDashboardPage() {
  const { token } = useAuth();
  const resource = useResource(() => api.customerDashboard(token!), [token]);
  return <CustomerLayout active="/dashboard"><PageHeading eyebrow="YOUR EVENTLINK" title="Welcome back." subtitle="Keep your inspiration close and discover the people who can bring it to life." />{resource.error && <Notice>{resource.error}</Notice>}{resource.loading && <Loading label="Loading your dashboard..." />}{resource.data && <div className="stats-grid"><StatCard value={resource.data.saved_business_count} label="Saved professionals" icon={<Bookmark size={18} />} to="/saved" /><StatCard value={resource.data.review_count} label="Reviews shared" icon={<Star size={18} />} to="/discover" /><StatCard value={resource.data.interactions_30_days} label="Connections this month" icon={<Heart size={18} />} to="/discover" /></div>}<section className="workspace-section"><SectionTitle title="A little inspiration" description="Your next favorite professional might be just around the corner." action={<Link className="text-link" to="/discover">Discover all <ArrowRight size={15} /></Link>} /><SuggestedBusinesses /></section></CustomerLayout>;
}

function StatCard({ value, label, icon, to }: { value: number; label: string; icon: ReactNode; to: string }) {
  return <Link className="stat-card" to={to}><span className="stat-icon">{icon}</span><strong>{value}</strong><span>{label}</span><ArrowRight className="stat-arrow" size={16} /></Link>;
}

function SuggestedBusinesses() {
  const resource = useResource(() => api.businesses(new URLSearchParams({ sort: "rating", limit: "3" })), []);
  if (resource.loading) return <Loading label="Finding inspiration..." />;
  if (resource.error) return <Notice>{resource.error}</Notice>;
  if (!resource.data?.length) return <EmptyState title="Your inspiration board is waiting">Explore the directory as soon as local professionals publish their listings.</EmptyState>;
  return <div className="business-grid">{resource.data.map((item, index) => <BusinessCard business={item} index={index} key={item.business.id} />)}</div>;
}

function SavedPage() {
  const { token } = useAuth();
  const resource = useResource(() => api.savedBusinesses(token!), [token]);
  const [saveError, setSaveError] = useState("");
  async function removeSaved(id: string) {
    setSaveError("");
    try {
      await api.unsaveBusiness(id, token!);
      resource.reload();
    } catch (reason) {
      setSaveError(errorMessage(reason));
    }
  }
  return <CustomerLayout active="/saved"><PageHeading eyebrow="YOUR COLLECTION" title="Saved for later." subtitle="All the professionals you want to keep in mind, gathered in one place." />{resource.error && <Notice>{resource.error}</Notice>}{saveError && <Notice>{saveError}</Notice>}{resource.loading && <Loading label="Loading your saved list..." />}{resource.data?.length ? <div className="business-grid">{resource.data.map((entry, index) => <BusinessCard business={entry.business} index={index} saved key={entry.business.business.id} onSave={removeSaved} />)}</div> : !resource.loading && <EmptyState icon={<Heart size={24} />} title="Your collection starts here">Save professionals that catch your eye while you explore.</EmptyState>}</CustomerLayout>;
}

function RecommendationsPage() {
  const { token } = useAuth();
  const resource = useResource(() => api.recommendations(token!), [token]);
  return <CustomerLayout active="/recommendations"><PageHeading eyebrow="PICKED FOR YOU" title="A few lovely possibilities." subtitle="Suggestions based on the preferences you’ve shared and the professionals you’ve saved." />{resource.error && <Notice>{resource.error}</Notice>}{resource.loading && <Loading label="Finding your recommendations..." />}{resource.data?.length ? <div className="business-grid">{resource.data.map((entry, index) => <BusinessCard key={entry.business.business.id} business={entry.business} index={index} />)}</div> : !resource.loading && <EmptyState icon={<Sparkles size={24} />} title="Your recommendations are taking shape">Set your preferences on your profile and save a few businesses to personalize your picks.</EmptyState>}</CustomerLayout>;
}

function CustomerProfilePage() {
  const { token } = useAuth();
  const profile = useResource(() => api.customerProfile(token!), [token]);
  const categories = useResource(api.categories, []);
  const action = useSubmission();
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const category_ids = form.getAll("category_ids").map(String);
    const preferences = {
      category_ids,
      location_city: String(form.get("location_city") || "") || null,
      location_country: String(form.get("location_country") || "") || null,
      max_price: String(form.get("max_price") || "") ? Number(form.get("max_price")) : null,
    };
    const result = await action.submit(() => api.updateCustomerProfile({ full_name: String(form.get("full_name")), preferences }, token!), "Your preferences have been saved.");
    if (result) profile.reload();
  }
  const preferences = profile.data?.preferences ?? {};
  const selectedIds = Array.isArray(preferences.category_ids) ? preferences.category_ids.map(String) : [];
  return <CustomerLayout active="/profile"><PageHeading eyebrow="A LITTLE ABOUT YOU" title="Make it yours." subtitle="Share a few preferences so your EventLink experience feels more like you." />{profile.error && <Notice>{profile.error}</Notice>}{profile.loading && <Loading label="Loading your profile..." />}{profile.data && <form className="panel-form" onSubmit={save}><label className="field"><span>Your name</span><input name="full_name" required maxLength={150} defaultValue={profile.data.full_name} /></label><div className="form-grid"><label className="field"><span>Preferred city</span><input name="location_city" maxLength={120} defaultValue={String(preferences.location_city ?? "")} placeholder="Any city" /></label><label className="field"><span>Country</span><input name="location_country" maxLength={120} defaultValue={String(preferences.location_country ?? "")} placeholder="Any country" /></label></div><label className="field"><span>Maximum service price (optional)</span><input name="max_price" type="number" min="0" step="0.01" defaultValue={String(preferences.max_price ?? "")} placeholder="No limit" /></label><fieldset className="category-checks"><legend>What are you looking for?</legend>{categories.data?.map((category) => <label key={category.id}><input type="checkbox" name="category_ids" value={category.id} defaultChecked={selectedIds.includes(category.id)} /> {category.name}</label>)}</fieldset><Feedback error={action.error || categories.error} success={action.success} /><button className="button button-dark" disabled={action.busy}>{action.busy ? "Saving..." : "Save preferences"} <Check size={16} /></button></form>}</CustomerLayout>;
}

function BusinessDashboardPage() {
  const { token } = useAuth();
  const dashboard = useResource(() => api.businessDashboard(token!), [token]);
  const account = useResource(() => api.businessAccount(token!), [token]);
  return <BusinessLayout active="/business"><PageHeading eyebrow="BUSINESS STUDIO" title={account.data?.business_name ?? "Your studio"} subtitle="A snapshot of how your EventLink presence is doing." />{dashboard.error && <Notice>{dashboard.error}</Notice>}{dashboard.loading && <Loading label="Loading studio..." />}{dashboard.data && <><div className="verification-banner"><span className={`status-dot status-${dashboard.data.verification_status ?? "setup"}`} /><div><strong>{statusTitle(dashboard.data.verification_status)}</strong><p>{statusDescription(dashboard.data.verification_status)}</p></div><Link className="text-link" to="/business/profile">Manage listing <ArrowRight size={15} /></Link></div><div className="stats-grid business-stats"><StatCard value={dashboard.data.views_30_days} label="Profile views · 30 days" icon={<Search size={18} />} to="/business/profile" /><StatCard value={dashboard.data.contacts_30_days} label="Contacts · 30 days" icon={<Mail size={18} />} to="/business/profile" /><StatCard value={dashboard.data.saves_30_days} label="Saves · 30 days" icon={<Heart size={18} />} to="/business/profile" /><div className="stat-card stat-card-static"><span className="stat-icon"><Star size={18} /></span><strong>{dashboard.data.average_rating.toFixed(1)}</strong><span>Average rating · {dashboard.data.review_count} reviews</span></div></div></>}<div className="workspace-section business-help"><CircleHelp size={20} /><div><strong>Need a hand with your listing?</strong><p>Keep your profile up to date so the right people can find you.</p></div><Link className="text-link" to="/business/profile">Edit your profile <ArrowRight size={15} /></Link></div></BusinessLayout>;
}

function statusTitle(status: BusinessDashboardData["verification_status"]) {
  if (status === "approved") return "Your business is verified";
  if (status === "pending") return "Verification is in progress";
  if (status === "rejected") return "Your verification needs attention";
  return "Finish setting up your listing";
}

function statusDescription(status: BusinessDashboardData["verification_status"]) {
  if (status === "approved") return "Your approved listing can be published and discovered by customers.";
  if (status === "pending") return "Our team is reviewing your business details.";
  if (status === "rejected") return "Update your business details and submit another verification request.";
  return "Add details about your services, then submit your listing for review.";
}

function BusinessProfilePage() {
  const { token } = useAuth();
  const accountResource = useResource(() => api.businessAccount(token!), [token]);
  const profileResource = useResource(() => api.businessProfile(token!), [token]);
  const categories = useResource(api.categories, []);
  const [isNew, setIsNew] = useState(false);
  const accountAction = useSubmission();
  const profileAction = useSubmission();
  const serviceAction = useSubmission();
  const portfolioAction = useSubmission();
  const verifyAction = useSubmission();
  const profile = profileResource.data;
  useEffect(() => {
    if (profileResource.error.includes("Business profile not found")) setIsNew(true);
  }, [profileResource.error]);

  async function saveAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const changed = await accountAction.submit(() => api.updateBusinessAccount({
      business_name: String(form.get("business_name")),
      contact_phone: String(form.get("contact_phone") || "") || null,
      contact_email: String(form.get("contact_email") || "") || null,
      location_city: String(form.get("location_city") || "") || null,
      location_country: String(form.get("location_country") || "") || null,
    }, token!), "Business details saved.");
    if (changed) accountResource.reload();
  }

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const description = String(form.get("description") || "");
    const category_ids = form.getAll("category_ids").map(String);
    const task = isNew
      ? () => api.createBusinessProfile(description, category_ids, token!)
      : () => api.updateBusinessProfile({ description, category_ids, is_published: form.get("is_published") === "on" }, token!);
    const changed = await profileAction.submit(task, isNew ? "Your listing profile was created." : "Your listing profile was saved.");
    if (changed) {
      setIsNew(false);
      profileResource.reload();
    }
  }

  async function addService(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const done = await serviceAction.submit(() => api.createService({
      name: String(form.get("name")),
      description: String(form.get("description") || ""),
      price: String(form.get("price") || ""),
      currency: String(form.get("currency") || "USD").toUpperCase(),
    }, token!), "Service added.");
    if (done) {
      formElement.reset();
      profileResource.reload();
    }
  }

  async function addPortfolio(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const done = await portfolioAction.submit(() => api.createPortfolioImage(String(form.get("image_url")), String(form.get("caption") || ""), token!), "Portfolio image added.");
    if (done) {
      formElement.reset();
      profileResource.reload();
    }
  }

  async function requestVerification() {
    if (await verifyAction.submit(() => api.requestVerification("", token!), "Your verification request was submitted.")) profileResource.reload();
  }

  return <BusinessLayout active="/business/profile"><PageHeading eyebrow="YOUR PUBLIC PRESENCE" title="Your listing." subtitle="Tell people what makes your work special and how to get in touch." />{accountResource.error && <Notice>{accountResource.error}</Notice>}{profileResource.error && !isNew && !profileResource.error.includes("404") && <Notice>{profileResource.error}</Notice>}{accountResource.loading && <Loading label="Loading your listing..." />}{accountResource.data && <><form className="panel-form listing-form" onSubmit={saveAccount}><SectionTitle title="Business details" description="The essentials customers use to find and contact you." /><div className="form-grid"><label className="field"><span>Business name</span><input name="business_name" required maxLength={200} defaultValue={accountResource.data.business_name} /></label><label className="field"><span>Contact email</span><input name="contact_email" type="email" defaultValue={accountResource.data.contact_email ?? ""} /></label><label className="field"><span>Phone</span><input name="contact_phone" maxLength={30} defaultValue={accountResource.data.contact_phone ?? ""} /></label><label className="field"><span>City</span><input name="location_city" maxLength={120} defaultValue={accountResource.data.location_city ?? ""} /></label><label className="field"><span>Country</span><input name="location_country" maxLength={120} defaultValue={accountResource.data.location_country ?? ""} /></label></div><Feedback error={accountAction.error} success={accountAction.success} /><button className="button button-dark" disabled={accountAction.busy}>{accountAction.busy ? "Saving..." : "Save details"} <Check size={16} /></button></form>
      <form className="panel-form listing-form" onSubmit={saveProfile}><SectionTitle title="Your story" description="A little more about your approach, services, and style." />{isNew && <Notice tone="info">Create your listing profile to add a description and choose your categories.</Notice>}<label className="field"><span>About your business</span><textarea name="description" rows={5} maxLength={10000} defaultValue={profile?.description ?? ""} placeholder="What do you love about the work you do?" /></label><fieldset className="category-checks"><legend>Your categories</legend>{categories.data?.map((category) => <label key={category.id}><input type="checkbox" name="category_ids" value={category.id} defaultChecked={profile?.categories.some((item) => item.id === category.id)} /> {category.name}</label>)}{categories.data?.length === 0 && <p className="muted-copy">No categories are available yet.</p>}</fieldset>{!isNew && <label className="toggle-field"><input type="checkbox" name="is_published" defaultChecked={profile?.is_published} disabled={profile?.verification_status !== "approved"} /><span><strong>Publish my listing</strong><small>{profile?.verification_status === "approved" ? "Your listing will be visible in public search." : "Publishing becomes available after approval."}</small></span></label>}<Feedback error={profileAction.error || categories.error} success={profileAction.success} /><button className="button button-dark" disabled={profileAction.busy}>{profileAction.busy ? "Saving..." : isNew ? "Create listing profile" : "Save listing"} <Check size={16} /></button></form>
      {!isNew && profile && <><section className="panel-form listing-form"><SectionTitle title="Services" description="Give customers a sense of what you offer." /><div className="service-list manage-list">{profile.services.map((service) => <div className="service-row" key={service.id}><div><strong>{service.name}</strong><p>{service.description || "No description"}</p></div><span>{service.price ? `${service.currency} ${service.price}` : "Ask for pricing"}</span><button className="icon-button danger" aria-label={`Delete ${service.name}`} onClick={async () => { if (window.confirm(`Remove ${service.name}?`)) { try { await api.deleteService(service.id, token!); profileResource.reload(); } catch (reason) { serviceAction.setError(errorMessage(reason)); } } }}><Trash2 size={16} /></button></div>)}</div><form className="inline-add-form" onSubmit={addService}><input name="name" placeholder="Service name" required maxLength={150} /><input name="description" placeholder="Short description" maxLength={5000} /><input name="price" placeholder="Price" type="number" min="0" step="0.01" /><select name="currency" defaultValue="USD"><option>USD</option><option>EUR</option><option>GBP</option><option>CAD</option><option>AUD</option></select><button className="button button-dark button-small" disabled={serviceAction.busy}><Plus size={15} /> Add</button></form><Feedback error={serviceAction.error} success={serviceAction.success} /></section>
      <section className="panel-form listing-form"><SectionTitle title="Portfolio" description="Show a few images that capture the feeling of your work." />{profile.portfolio_images.length > 0 && <div className="manage-portfolio">{profile.portfolio_images.map((image) => <div key={image.id}><img src={image.image_url} alt={image.caption || "Portfolio"} /><span>{image.caption || "Portfolio image"}</span><button className="icon-button danger" aria-label="Remove image" onClick={async () => { try { await api.deletePortfolioImage(image.id, token!); profileResource.reload(); } catch (reason) { portfolioAction.setError(errorMessage(reason)); } }}><Trash2 size={15} /></button></div>)}</div>}<form className="inline-add-form portfolio-add" onSubmit={addPortfolio}><input name="image_url" type="url" required placeholder="https://image-url.jpg" /><input name="caption" placeholder="Image caption" maxLength={255} /><button className="button button-dark button-small" disabled={portfolioAction.busy}><Plus size={15} /> Add image</button></form><Feedback error={portfolioAction.error} success={portfolioAction.success} /></section>
      <section className="verification-banner"><span className={`status-dot status-${profile.verification_status}`} /><div><strong>{statusTitle(profile.verification_status)}</strong><p>{statusDescription(profile.verification_status)}</p></div>{profile.verification_status !== "approved" && profile.verification_status !== "pending" && <button className="button button-dark button-small" onClick={requestVerification} disabled={verifyAction.busy}>{verifyAction.busy ? "Sending..." : "Request verification"} <ArrowRight size={15} /></button>}</section><Feedback error={verifyAction.error} success={verifyAction.success} /></>}</>}</BusinessLayout>;
}

function AdminPage() {
  const [tab, setTab] = useState<"verification" | "categories">("verification");
  return <AdminLayout active="/admin"><PageHeading eyebrow="EVENTLINK ADMIN" title="A thoughtful community starts here." subtitle="Review business listings and keep the directory organized." /><div className="admin-tabs"><button className={tab === "verification" ? "active" : ""} onClick={() => setTab("verification")}><ShieldCheck size={16} /> Verification queue</button><button className={tab === "categories" ? "active" : ""} onClick={() => setTab("categories")}><Sparkles size={16} /> Categories</button></div>{tab === "verification" ? <VerificationQueue /> : <CategoryManager />}</AdminLayout>;
}

function VerificationQueue() {
  const { token } = useAuth();
  const resource = useResource(() => api.verificationQueue(token!), [token]);
  const action = useSubmission();
  async function decide(request: VerificationRequest, status: "approved" | "rejected") {
    if (!window.confirm(`${status === "approved" ? "Approve" : "Reject"} ${request.business_name}?`)) return;
    const success = await action.submit(() => api.decideVerification(request.record_id, status, "", token!), `Business ${status}.`);
    if (success) resource.reload();
  }
  return <section className="workspace-section"><SectionTitle title="Waiting for your review" description="Approve a listing when its business details have been checked." />{action.error && <Notice>{action.error}</Notice>}{action.success && <Notice tone="success">{action.success}</Notice>}{resource.error && <Notice>{resource.error}</Notice>}{resource.loading && <Loading label="Loading verification requests..." />}{resource.data?.length ? <div className="verification-list">{resource.data.map((request) => <article className="verification-row" key={request.record_id}><span className="verification-icon"><ShieldCheck size={20} /></span><div className="verification-info"><strong>{request.business_name}</strong><span>{request.contact_email || "No contact email provided"}</span><small>Submitted {new Date(request.created_at).toLocaleDateString()}</small></div><div className="verification-actions"><button className="button button-outline button-small" disabled={action.busy} onClick={() => decide(request, "rejected")}>Reject</button><button className="button button-dark button-small" disabled={action.busy} onClick={() => decide(request, "approved")}><Check size={15} /> Approve</button></div></article>)}</div> : !resource.loading && <EmptyState icon={<BadgeCheck size={24} />} title="All caught up">There are no pending business verification requests.</EmptyState>}</section>;
}

function CategoryManager() {
  const { token } = useAuth();
  const resource = useResource(api.categories, []);
  const action = useSubmission();
  async function addCategory(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    if (await action.submit(() => api.createCategory(String(form.get("name")), String(form.get("description") || ""), token!), "Category added.")) {
      formElement.reset();
      resource.reload();
    }
  }
  async function remove(category: Category) {
    if (!window.confirm(`Delete the “${category.name}” category?`)) return;
    if (await action.submit(() => api.deleteCategory(category.id, token!), "Category deleted.")) resource.reload();
  }
  return <section className="workspace-section"><SectionTitle title="Directory categories" description="These categories help customers find the right kind of professional." /><form className="inline-add-form category-add" onSubmit={addCategory}><input name="name" required maxLength={100} placeholder="New category name" /><input name="description" placeholder="Short description (optional)" /><button className="button button-dark button-small" disabled={action.busy}><Plus size={15} /> Add category</button></form><Feedback error={action.error || resource.error} success={action.success} />{resource.loading && <Loading label="Loading categories..." />}{resource.data?.length ? <div className="category-admin-list">{resource.data.map((category) => <article key={category.id}><div><strong>{category.name}</strong><p>{category.description || "No description"}</p></div><button className="icon-button danger" aria-label={`Delete ${category.name}`} disabled={action.busy} onClick={() => remove(category)}><Trash2 size={16} /></button></article>)}</div> : !resource.loading && <EmptyState title="No categories yet">Add the first category to help customers browse.</EmptyState>}</section>;
}

function NotFoundPage() {
  return <div className="page-wrap not-found"><span className="auth-mark"><Sparkles size={20} /></span><span className="eyebrow">A LITTLE DETOUR</span><h1>We can’t find that page.</h1><p>Let’s get you back to the good stuff.</p><Link className="button button-dark" to="/">Back to EventLink <ArrowRight size={16} /></Link></div>;
}

export default function App() {
  return <><Header /><Routes>
    <Route path="/" element={<LandingPage />} />
    <Route path="/discover" element={<DiscoverPage />} />
    <Route path="/businesses/:id" element={<BusinessDetailsPage />} />
    <Route path="/login" element={<LoginPage />} />
    <Route path="/register" element={<RegisterPage />} />
    <Route path="/forgot-password" element={<ForgotPasswordPage />} />
    <Route path="/reset-password" element={<ResetPasswordPage />} />
    <Route path="/dashboard" element={<Protected role="customer"><CustomerDashboardPage /></Protected>} />
    <Route path="/saved" element={<Protected role="customer"><SavedPage /></Protected>} />
    <Route path="/recommendations" element={<Protected role="customer"><RecommendationsPage /></Protected>} />
    <Route path="/profile" element={<Protected role="customer"><CustomerProfilePage /></Protected>} />
    <Route path="/business" element={<Protected role="business"><BusinessDashboardPage /></Protected>} />
    <Route path="/business/profile" element={<Protected role="business"><BusinessProfilePage /></Protected>} />
    <Route path="/admin" element={<Protected role="admin"><AdminPage /></Protected>} />
    <Route path="*" element={<NotFoundPage />} />
  </Routes><Footer /></>;
}
