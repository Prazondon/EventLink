/**
 * Entry pages for each kind of visitor:
 *   /login            chooser (customer or business)
 *   /login/customer   customer sign in
 *   /login/business   business sign in
 *   /admin/login      administrator sign in (not linked from the public UI)
 *   /for-business     marketing page that explains listing a business
 */
import { ArrowRight, BadgeCheck, Building2, Camera, Eye, EyeOff, Heart, Scale, Sparkles, Star, Users } from "lucide-react";
import { type FormEvent, useEffect, useRef, useState } from "react";
import { Link, Navigate, useSearchParams } from "react-router-dom";
import { useAuth } from "./auth";
import { Feedback, roleHome, safeNext, useSubmission } from "./shared";
import type { UserRole } from "./types";

const photo = (id: string, width = 1400) => `https://images.unsplash.com/${id}?auto=format&fit=crop&w=${width}&q=80`;

/* ---------------------------------------------------------------- chooser -- */

export function LoginChooser() {
  const [params] = useSearchParams();
  const next = params.get("next");
  const suffix = next ? `?next=${encodeURIComponent(next)}` : "";
  return (
    <div className="chooser">
      <div className="chooser-head">
        <span className="eyebrow">WELCOME BACK</span>
        <h1>Who is signing in?</h1>
        <p>Pick the door that fits. You will land on the right dashboard.</p>
      </div>
      <div className="chooser-grid">
        <Link className="chooser-card chooser-customer" to={`/login/customer${suffix}`}>
          <img src={photo("photo-1519741497674-611481863552", 900)} alt="" loading="lazy" />
          <div>
            <Users size={22} />
            <h2>I'm planning an event</h2>
            <p>Search, save and review event professionals. Get picks made for you.</p>
            <span className="chooser-go">Customer sign in <ArrowRight size={16} /></span>
          </div>
        </Link>
        <Link className="chooser-card chooser-business" to={`/login/business${suffix}`}>
          <img src={photo("photo-1511795409834-ef04bbd61622", 900)} alt="" loading="lazy" />
          <div>
            <Building2 size={22} />
            <h2>I run an event business</h2>
            <p>Manage your listing, see who is looking at you and read your reviews.</p>
            <span className="chooser-go">Business sign in <ArrowRight size={16} /></span>
          </div>
        </Link>
      </div>
      <p className="chooser-foot">
        New here? <Link to="/register">Create a customer account</Link> or <Link to="/register?role=business">list your business</Link>.
      </p>
    </div>
  );
}

/* ----------------------------------------------------------- portal login -- */

const COPY: Record<"customer" | "business" | "admin", { eyebrow: string; title: string; sub: string; asideTitle: string; points: string[]; switchLabel: string; switchTo: string; register: string; registerLabel: string; image: string }> = {
  customer: {
    eyebrow: "CUSTOMER SIGN IN",
    title: "Welcome back.",
    sub: "Pick up your shortlist and recommendations.",
    asideTitle: "Your people are waiting.",
    points: ["Your saved professionals, in one place", "Recommendations ranked around your budget and city", "Reviews that help the next person decide"],
    switchLabel: "Run an event business?",
    switchTo: "/login/business",
    register: "/register",
    registerLabel: "Create a customer account",
    image: photo("photo-1519741497674-611481863552", 1200),
  },
  business: {
    eyebrow: "BUSINESS SIGN IN",
    title: "Back to your studio.",
    sub: "Manage your listing and see how you are doing.",
    asideTitle: "Be found by the people who need you.",
    points: ["See profile views, saves and contacts", "Read and track every review", "Get verified and earn a trusted badge"],
    switchLabel: "Planning an event?",
    switchTo: "/login/customer",
    register: "/register?role=business",
    registerLabel: "List your business",
    image: photo("photo-1511795409834-ef04bbd61622", 1200),
  },
  admin: {
    eyebrow: "ADMINISTRATOR",
    title: "Admin sign in.",
    sub: "Review business verification requests and manage categories.",
    asideTitle: "Keep the directory trustworthy.",
    points: ["Approve or reject pending listings", "Record a reason for every decision", "Maintain the category list"],
    switchLabel: "Not an administrator?",
    switchTo: "/login",
    register: "/login",
    registerLabel: "Choose another sign in",
    image: photo("photo-1464366400600-7168b8af9bc3", 1200),
  },
};

const DEMO: Record<"customer" | "business" | "admin", { email: string; label: string }[]> = {
  customer: [{ email: "asha@demo-eventlink.com", label: "Demo customer" }],
  business: [{ email: "business1@demo-eventlink.com", label: "Demo business" }],
  admin: [{ email: "admin@demo-eventlink.com", label: "Demo admin" }],
};
const DEMO_PASSWORD = "EventLink-Demo-2026";

export function PortalLogin({ role }: { role: "customer" | "business" | "admin" }) {
  const copy = COPY[role];
  const { signIn, user } = useAuth();
  const [params] = useSearchParams();
  const action = useSubmission();
  const [show, setShow] = useState(false);
  const email = useRef<HTMLInputElement>(null);
  const password = useRef<HTMLInputElement>(null);

  // Signing in sets `user`; a visitor who picked the wrong door still lands on their own dashboard.
  if (user) {
    return <Navigate to={safeNext(params.get("next")) ?? roleHome(user.role as UserRole)} replace />;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await action.submit(() => signIn(String(form.get("email")), String(form.get("password"))), "Welcome back.");
  }

  return (
    <div className={`portal portal-${role}`}>
      <div className="portal-form">
        <span className="eyebrow">{copy.eyebrow}</span>
        <h1>{copy.title}</h1>
        <p className="auth-subtitle">{copy.sub}</p>
        <form className="auth-form" onSubmit={handleSubmit}>
          <label className="field"><span>Email address</span><input ref={email} type="email" name="email" autoComplete="email" required placeholder="you@example.com" /></label>
          <label className="field">
            <span>Password</span>
            <span className="input-with-action">
              <input ref={password} type={show ? "text" : "password"} name="password" autoComplete="current-password" required placeholder="Your password" />
              <button type="button" className="icon-toggle" onClick={() => setShow(!show)} aria-label={show ? "Hide password" : "Show password"}>{show ? <EyeOff size={17} /> : <Eye size={17} />}</button>
            </span>
          </label>
          <div className="auth-helper"><Link to="/forgot-password">Forgot password?</Link></div>
          <Feedback error={action.error} success={action.success} />
          <button className="button button-dark button-full" disabled={action.busy}>{action.busy ? "Signing in..." : "Sign in"} <ArrowRight size={16} /></button>
          {import.meta.env.DEV && (
            <div className="demo-fill">
              <small>Local demo data</small>
              {DEMO[role].map((entry) => (
                <button
                  type="button"
                  key={entry.email}
                  onClick={() => {
                    if (email.current) email.current.value = entry.email;
                    if (password.current) password.current.value = DEMO_PASSWORD;
                  }}
                >
                  Fill {entry.label.toLowerCase()}
                </button>
              ))}
            </div>
          )}
          <p className="auth-switch">{role !== "admin" ? <>New? <Link to={copy.register}>{copy.registerLabel}</Link> · </> : null}{copy.switchLabel} <Link to={copy.switchTo}>{role === "admin" ? "Go back" : "Switch"}</Link></p>
        </form>
      </div>
      <aside className="portal-aside" style={{ backgroundImage: `linear-gradient(180deg, rgb(10 28 22 / 0.55), rgb(10 28 22 / 0.92)), url("${copy.image}")` }}>
        <span className="eyebrow eyebrow-light">EVENTLINK</span>
        <h2>{copy.asideTitle}</h2>
        <ul>{copy.points.map((point) => <li key={point}><BadgeCheck size={18} /> {point}</li>)}</ul>
      </aside>
    </div>
  );
}

/* ---------------------------------------------------------- for-business -- */

const STEPS = [
  { icon: <Building2 size={22} />, title: "Create your account", text: "Sign up with your business name and city. It takes a minute and costs nothing." },
  { icon: <Camera size={22} />, title: "Build your listing", text: "Add your story, services with prices and photos of your best work." },
  { icon: <BadgeCheck size={22} />, title: "Get verified", text: "Submit for a quick review. Approved listings earn a Verified badge." },
  { icon: <Heart size={22} />, title: "Be discovered", text: "Customers search, save and contact you. Reviews build your reputation." },
];

const BENEFITS = [
  { icon: <Users size={22} />, title: "Reach people who are already planning", text: "Customers arrive with a date and a budget. They filter by category, city and price." },
  { icon: <Scale size={22} />, title: "Fair to new businesses", text: "Recommendations balance popularity so smaller and newer providers still get seen." },
  { icon: <Star size={22} />, title: "Reviews that earn trust", text: "Verified reviews from real customers sit on your page and improve your ranking." },
  { icon: <Sparkles size={22} />, title: "See what is working", text: "Your studio shows profile views, saves and contacts so you know where interest comes from." },
];

const FAQ = [
  ["Does it cost anything to list?", "No. Creating and publishing a listing is free."],
  ["Who can see my listing?", "Only after an administrator approves it and you publish it. Until then it stays private."],
  ["How long does verification take?", "An administrator reviews pending listings in order. You will see the status on your dashboard."],
  ["Can I edit my listing later?", "Yes. You can update your story, services and photos whenever you like."],
];

export function ForBusinessPage() {
  const { user } = useAuth();
  const [active, setActive] = useState(0);
  const refs = useRef<(HTMLLIElement | null)[]>([]);

  // Highlight the step nearest the middle of the screen as the visitor scrolls.
  useEffect(() => {
    if (!("IntersectionObserver" in window)) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) if (entry.isIntersecting) setActive(Number((entry.target as HTMLElement).dataset.step));
      },
      { rootMargin: "-45% 0px -45% 0px" },
    );
    refs.current.forEach((node) => node && io.observe(node));
    return () => io.disconnect();
  }, []);

  const cta = user?.role === "business" ? { to: "/business", label: "Open your studio" } : { to: "/register?role=business", label: "List your business" };

  return (
    <main className="fb-page">
      <section className="fb-hero">
        <div className="fb-hero-copy">
          <span className="eyebrow eyebrow-light">FOR EVENT PROFESSIONALS</span>
          <h1>Your next client is <em>already searching.</em></h1>
          <p>EventLink puts caterers, photographers, florists, venues, musicians and planners in front of people who are planning right now.</p>
          <div className="fb-hero-actions">
            <Link className="button button-accent" to={cta.to}>{cta.label} <ArrowRight size={16} /></Link>
            {!user && <Link className="button button-outline-light" to="/login/business">Business sign in</Link>}
          </div>
          <ul className="fb-hero-points">
            <li><BadgeCheck size={16} /> Free to list</li>
            <li><BadgeCheck size={16} /> Verified badge</li>
            <li><BadgeCheck size={16} /> No booking fees</li>
          </ul>
        </div>
        <div className="fb-hero-art" aria-hidden="true">
          <img src={photo("photo-1511795409834-ef04bbd61622", 1000)} alt="" />
          <div className="fb-float fb-float-a"><Star size={16} fill="currentColor" /> 4.9 · 32 reviews</div>
          <div className="fb-float fb-float-b"><BadgeCheck size={16} /> Verified</div>
        </div>
      </section>

      <section className="fb-steps">
        <div className="fb-steps-intro">
          <span className="eyebrow">HOW IT WORKS</span>
          <h2>From sign-up to first enquiry in four steps.</h2>
          <div className="fb-steps-meter" aria-hidden="true">
            {STEPS.map((_, index) => <i key={index} className={index <= active ? "is-on" : ""} />)}
          </div>
        </div>
        <ol>
          {STEPS.map((step, index) => (
            <li key={step.title} data-step={index} ref={(node) => { refs.current[index] = node; }} className={`fb-step${index === active ? " is-active" : ""}`}>
              <span className="fb-step-icon">{step.icon}</span>
              <div>
                <small>Step {index + 1}</small>
                <h3>{step.title}</h3>
                <p>{step.text}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className="fb-benefits">
        <span className="eyebrow">WHY EVENTLINK</span>
        <h2>Built to be fair, honest and useful.</h2>
        <div className="fb-benefit-grid">
          {BENEFITS.map((benefit) => (
            <article key={benefit.title} className="fb-benefit">
              <span className="fb-step-icon">{benefit.icon}</span>
              <h3>{benefit.title}</h3>
              <p>{benefit.text}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="fb-faq">
        <h2>Questions, answered.</h2>
        {FAQ.map(([question, answer]) => (
          <details key={question}>
            <summary>{question}</summary>
            <p>{answer}</p>
          </details>
        ))}
      </section>

      <section className="fb-cta">
        <h2>Ready when you are.</h2>
        <p>Create your listing today. It is free and takes a few minutes.</p>
        <Link className="button button-accent" to={cta.to}>{cta.label} <ArrowRight size={16} /></Link>
      </section>
    </main>
  );
}
