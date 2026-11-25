/**
 * Signed-in pages for each role (SRS 3.6 dashboards, 3.5 reviews).
 *   customer: overview, my reviews
 *   business: overview with setup checklist, received reviews
 */
import {
  ArrowRight,
  Bookmark,
  Check,
  Circle,
  Eye,
  Heart,
  Mail,
  Pencil,
  Search,
  Sparkles,
  Star,
  Trash2,
} from "lucide-react";
import { type FormEvent, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "./api";
import { useAuth } from "./auth";
import {
  BusinessCard,
  EmptyState,
  Loading,
  Notice,
  PageHeading,
  SectionTitle,
  Stars,
} from "./components";
import {
  BusinessLayout,
  CustomerLayout,
  Feedback,
  StatCard,
  errorMessage,
  useResource,
  useSubmission,
} from "./shared";
import type { BusinessDashboardData, MyReview, Review } from "./types";

const dateText = (value: string) =>
  new Date(value).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });

function greeting() {
  const hour = new Date().getHours();
  return hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
}

function StarPicker({ value, onChange, label }: { value: number; onChange: (next: number) => void; label: string }) {
  return (
    <div className="star-picker" role="radiogroup" aria-label={label}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          type="button"
          key={n}
          role="radio"
          aria-checked={value === n}
          aria-label={`${n} star${n > 1 ? "s" : ""}`}
          className={n <= value ? "is-on" : ""}
          onClick={() => onChange(n)}
        >
          <Star size={22} fill={n <= value ? "currentColor" : "none"} />
        </button>
      ))}
    </div>
  );
}

/* =============================================================== CUSTOMER */

export function CustomerHome() {
  const { token, user } = useAuth();
  const stats = useResource(() => api.customerDashboard(token!), [token]);
  const profile = useResource(() => api.customerProfile(token!), [token]);
  const picks = useResource(() => api.recommendations(token!), [token]);
  const saved = useResource(() => api.savedBusinesses(token!), [token]);
  const reviews = useResource(() => api.myReviews(token!), [token]);
  const fallback = useResource(() => api.businesses(new URLSearchParams({ sort: "rating", limit: "3" })), []);

  const firstName = (profile.data?.full_name ?? user?.email ?? "").split(/[\s@]/)[0];
  const preferences = profile.data?.preferences ?? {};
  const hasPreferences =
    (Array.isArray(preferences.category_ids) && preferences.category_ids.length > 0) ||
    Boolean(preferences.location_city) ||
    Boolean(preferences.max_price);
  const personal = picks.data?.length ? picks.data.slice(0, 3).map((entry) => entry.business) : null;

  return (
    <CustomerLayout active="/dashboard">
      <section className="welcome-band">
        <div>
          <span className="eyebrow eyebrow-light">YOUR EVENTLINK</span>
          <h1>{greeting()}{firstName ? `, ${firstName}` : ""}.</h1>
          <p>Plan with people you trust. Search the directory, keep a shortlist and share what you think.</p>
        </div>
        <div className="welcome-actions">
          <Link className="button button-accent" to="/discover"><Search size={16} /> Find professionals</Link>
          <Link className="button button-outline-light" to="/profile">Set preferences</Link>
        </div>
      </section>

      {stats.error && <Notice>{stats.error}</Notice>}
      {stats.data && (
        <div className="stats-grid">
          <StatCard value={stats.data.saved_business_count} label="Saved professionals" icon={<Bookmark size={18} />} to="/saved" />
          <StatCard value={stats.data.review_count} label="Reviews shared" icon={<Star size={18} />} to="/my-reviews" />
          <StatCard value={stats.data.interactions_30_days} label="Connections this month" icon={<Heart size={18} />} to="/discover" />
        </div>
      )}

      {!hasPreferences && !profile.loading && (
        <div className="nudge">
          <Sparkles size={20} />
          <div>
            <strong>Get picks made for you</strong>
            <p>Tell us the kind of professional, your city and a budget, and we will rank the directory around you.</p>
          </div>
          <Link className="button button-dark button-small" to="/profile">Add preferences <ArrowRight size={15} /></Link>
        </div>
      )}

      <section className="workspace-section">
        <SectionTitle
          title={personal ? "Picked for you" : "Popular right now"}
          description={personal ? "Ranked from your preferences, your saves and what similar people liked." : "Top-rated professionals while we learn what you like."}
          action={<Link className="text-link" to="/recommendations">See all <ArrowRight size={15} /></Link>}
        />
        {(picks.loading || fallback.loading) && !personal && !fallback.data && <Loading label="Finding your picks..." />}
        {(personal ?? fallback.data)?.length ? (
          <div className="business-grid">
            {(personal ?? fallback.data ?? []).map((item, index) => <BusinessCard key={item.business.id} business={item} index={index} />)}
          </div>
        ) : null}
      </section>

      <section className="workspace-section">
        <SectionTitle
          title="Your shortlist"
          description="Professionals you saved for later."
          action={<Link className="text-link" to="/saved">All saved <ArrowRight size={15} /></Link>}
        />
        {saved.loading && <Loading label="Loading your shortlist..." />}
        {saved.data?.length ? (
          <div className="business-grid">
            {saved.data.slice(0, 3).map((entry, index) => <BusinessCard key={entry.business.business.id} business={entry.business} index={index} />)}
          </div>
        ) : !saved.loading && (
          <EmptyState icon={<Bookmark size={24} />} title="Nothing saved yet" action={<Link className="button button-dark button-small" to="/discover">Browse the directory</Link>}>
            Tap the bookmark on any card to keep a professional here.
          </EmptyState>
        )}
      </section>

      <section className="workspace-section">
        <SectionTitle
          title="Your recent reviews"
          description="What you have shared with the community."
          action={<Link className="text-link" to="/my-reviews">Manage reviews <ArrowRight size={15} /></Link>}
        />
        {reviews.loading && <Loading label="Loading your reviews..." />}
        {reviews.data?.length ? (
          <div className="review-list">
            {reviews.data.slice(0, 3).map((entry) => (
              <article className="review-row" key={entry.id}>
                <div className="review-row-top"><strong><Link to={`/businesses/${entry.business_id}`}>{entry.business_name}</Link></strong><time>{dateText(entry.created_at)}</time></div>
                <Stars rating={entry.rating} />
                {entry.comment_text && <p>{entry.comment_text}</p>}
              </article>
            ))}
          </div>
        ) : !reviews.loading && <p className="muted-copy">You have not reviewed anyone yet. Open a professional's page to leave one.</p>}
      </section>
    </CustomerLayout>
  );
}

export function MyReviewsPage() {
  const { token } = useAuth();
  const reviews = useResource(() => api.myReviews(token!), [token]);
  const [editing, setEditing] = useState<string | null>(null);
  const action = useSubmission();

  async function remove(entry: MyReview) {
    if (!window.confirm(`Remove your review of ${entry.business_name}?`)) return;
    if (await action.submit(() => api.deleteMyReview(entry.business_id, token!), "Review removed.")) reviews.reload();
  }

  return (
    <CustomerLayout active="/my-reviews">
      <PageHeading eyebrow="YOUR VOICE" title="Your reviews." subtitle="Honest reviews help other people plan with confidence. You can change or remove yours at any time." />
      <Feedback error={action.error || reviews.error} success={action.success} />
      {reviews.loading && <Loading label="Loading your reviews..." />}
      {reviews.data?.length ? (
        <div className="review-list review-list-wide">
          {reviews.data.map((entry) =>
            editing === entry.id ? (
              <ReviewEditor key={entry.id} entry={entry} onDone={() => { setEditing(null); reviews.reload(); }} />
            ) : (
              <article className="review-row" key={entry.id}>
                <div className="review-row-top">
                  <strong><Link to={`/businesses/${entry.business_id}`}>{entry.business_name}</Link></strong>
                  <time>{dateText(entry.created_at)}</time>
                </div>
                <Stars rating={entry.rating} />
                <p>{entry.comment_text || "No comment."}</p>
                <div className="row-actions">
                  <button type="button" className="button button-outline button-small" onClick={() => setEditing(entry.id)}><Pencil size={14} /> Edit</button>
                  <button type="button" className="button button-outline button-small" onClick={() => remove(entry)}><Trash2 size={14} /> Remove</button>
                </div>
              </article>
            ),
          )}
        </div>
      ) : !reviews.loading && (
        <EmptyState icon={<Star size={24} />} title="No reviews yet" action={<Link className="button button-dark button-small" to="/discover">Find someone to review</Link>}>
          After you work with a professional, open their page and share how it went.
        </EmptyState>
      )}
    </CustomerLayout>
  );
}

function ReviewEditor({ entry, onDone }: { entry: MyReview; onDone: () => void }) {
  const { token } = useAuth();
  const [rating, setRating] = useState(entry.rating);
  const [comment, setComment] = useState(entry.comment_text ?? "");
  const action = useSubmission();
  async function save(event: FormEvent) {
    event.preventDefault();
    if (await action.submit(() => api.updateMyReview(entry.business_id, rating, comment, token!), "Saved.")) onDone();
  }
  return (
    <form className="review-row review-editor" onSubmit={save}>
      <strong>{entry.business_name}</strong>
      <StarPicker value={rating} onChange={setRating} label="Your rating" />
      <label className="field"><span>Your comments</span><textarea rows={3} maxLength={2000} value={comment} onChange={(event) => setComment(event.target.value)} /></label>
      <Feedback error={action.error} success="" />
      <div className="row-actions">
        <button className="button button-dark button-small" disabled={action.busy}>{action.busy ? "Saving..." : "Save review"}</button>
        <button type="button" className="button button-outline button-small" onClick={onDone}>Cancel</button>
      </div>
    </form>
  );
}

/* =============================================================== BUSINESS */

function statusHeadline(status: BusinessDashboardData["verification_status"]) {
  if (status === "approved") return ["Verified and live", "Customers can find your listing in the directory."];
  if (status === "pending") return ["Waiting for review", "Finish your listing and submit it. You will see the result here."];
  if (status === "rejected") return ["Verification needs attention", "Update your listing and submit it again."];
  return ["Finish setting up your listing", "Complete the steps below, then submit for verification."];
}

export function BusinessHome() {
  const { token } = useAuth();
  const dashboard = useResource(() => api.businessDashboard(token!), [token]);
  const account = useResource(() => api.businessAccount(token!), [token]);
  const profile = useResource(() => api.businessProfile(token!), [token]);
  const reviews = useResource(() => api.businessReviews(token!), [token]);

  const p = profile.error ? null : profile.data;
  const steps = [
    { done: Boolean(account.data?.contact_phone && account.data?.location_city), title: "Add your contact details", hint: "A phone number and city so customers know where you work." },
    { done: Boolean(p?.description), title: "Tell your story", hint: "A short description and at least one category." },
    { done: (p?.services.length ?? 0) > 0, title: "List a service", hint: "Name it and give a starting price." },
    { done: (p?.portfolio_images.length ?? 0) > 0, title: "Show your work", hint: "Add one or more portfolio images." },
    { done: p?.verification_status === "approved", title: "Get verified", hint: "Press Submit for review on your listing page. An administrator checks it." },
    { done: Boolean(p?.is_published && p.verification_status === "approved"), title: "Go live", hint: "Publish once you are approved." },
  ];
  const doneCount = steps.filter((step) => step.done).length;
  const percent = Math.round((doneCount / steps.length) * 100);
  const [headline, sub] = statusHeadline(dashboard.data?.verification_status ?? null);
  const nextStep = steps.find((step) => !step.done);

  return (
    <BusinessLayout active="/business">
      <section className="welcome-band welcome-band-studio">
        <div>
          <span className="eyebrow eyebrow-light">BUSINESS STUDIO</span>
          <h1>{account.data?.business_name ?? "Your studio"}</h1>
          <p>{headline}. {sub}</p>
        </div>
        <div className="welcome-actions">
          <Link className="button button-accent" to="/business/profile">Edit listing <ArrowRight size={15} /></Link>
          {dashboard.data?.verification_status === "approved" && dashboard.data.business_id && (
            <Link className="button button-outline-light" to={`/businesses/${dashboard.data.business_id}`}><Eye size={15} /> View public page</Link>
          )}
        </div>
      </section>

      {dashboard.error && <Notice>{dashboard.error}</Notice>}
      {dashboard.data && (
        <div className="stats-grid business-stats">
          <StatCard value={dashboard.data.views_30_days} label="Profile views · 30 days" icon={<Eye size={18} />} to="/business/profile" />
          <StatCard value={dashboard.data.contacts_30_days} label="Contacts · 30 days" icon={<Mail size={18} />} to="/business" />
          <StatCard value={dashboard.data.saves_30_days} label="Saves · 30 days" icon={<Heart size={18} />} to="/business/profile" />
          <Link to="/business/reviews" className="stat-card">
            <span className="stat-icon"><Star size={18} /></span>
            <strong>{dashboard.data.average_rating.toFixed(1)}</strong>
            <span>Average rating · {dashboard.data.review_count} reviews</span>
            <ArrowRight className="stat-arrow" size={16} />
          </Link>
        </div>
      )}

      {percent < 100 && (
        <section className="workspace-section checklist-card">
          <div className="checklist-head">
            <div className="progress-ring" style={{ ["--pct" as string]: `${percent}%` }} role="img" aria-label={`${percent} percent complete`}><span>{percent}%</span></div>
            <div>
              <h2>Get your listing ready</h2>
              <p>{nextStep ? `Next: ${nextStep.title.toLowerCase()}.` : "All set."} Complete listings rank higher and earn more enquiries.</p>
            </div>
            <Link className="button button-dark button-small" to="/business/profile">Continue <ArrowRight size={15} /></Link>
          </div>
          <ol className="checklist">
            {steps.map((step) => (
              <li key={step.title} className={step.done ? "is-done" : ""}>
                <span className="check-dot" aria-hidden="true">{step.done ? <Check size={14} /> : <Circle size={10} />}</span>
                <div><strong>{step.title}</strong><small>{step.hint}</small></div>
                <span className="sr-only">{step.done ? "Done" : "To do"}</span>
              </li>
            ))}
          </ol>
        </section>
      )}

      <section className="workspace-section">
        <SectionTitle
          title="Latest reviews"
          description="What customers are saying about you."
          action={<Link className="text-link" to="/business/reviews">All reviews <ArrowRight size={15} /></Link>}
        />
        {reviews.loading && <Loading label="Loading reviews..." />}
        {reviews.data?.items.length ? (
          <div className="review-list">{reviews.data.items.slice(0, 3).map((entry) => <ReceivedReview key={entry.id} review={entry} />)}</div>
        ) : !reviews.loading && <p className="muted-copy">No reviews yet. They appear here as soon as customers leave one.</p>}
      </section>
    </BusinessLayout>
  );
}

function ReceivedReview({ review }: { review: Review }) {
  return (
    <article className="review-row">
      <div className="review-row-top"><Stars rating={review.rating} /><time>{dateText(review.created_at)}</time></div>
      <p>{review.comment_text || "No comment left."}</p>
    </article>
  );
}

export function BusinessReviewsPage() {
  const { token } = useAuth();
  const reviews = useResource(() => api.businessReviews(token!), [token]);
  const items = reviews.data?.items ?? [];
  const counts = [5, 4, 3, 2, 1].map((n) => ({ n, count: items.filter((entry) => entry.rating === n).length }));
  const max = Math.max(1, ...counts.map((entry) => entry.count));

  return (
    <BusinessLayout active="/business/reviews">
      <PageHeading eyebrow="CUSTOMER FEEDBACK" title="Reviews." subtitle="Every review about your business, newest first." />
      {reviews.error && <Notice>{errorMessage(reviews.error)}</Notice>}
      {reviews.loading && <Loading label="Loading reviews..." />}
      {reviews.data && (
        <>
          <div className="rating-summary">
            <div className="rating-big">
              <strong>{reviews.data.average_rating.toFixed(1)}</strong>
              <Stars rating={reviews.data.average_rating} />
              <small>{reviews.data.total} {reviews.data.total === 1 ? "review" : "reviews"}</small>
            </div>
            <div className="rating-bars" aria-label="Rating breakdown">
              {counts.map((entry) => (
                <div className="rating-bar" key={entry.n}>
                  <span>{entry.n} <Star size={12} fill="currentColor" /></span>
                  <div><i style={{ width: `${(entry.count / max) * 100}%` }} /></div>
                  <span>{entry.count}</span>
                </div>
              ))}
            </div>
          </div>
          {items.length ? (
            <div className="review-list review-list-wide">{items.map((entry) => <ReceivedReview key={entry.id} review={entry} />)}</div>
          ) : (
            <EmptyState icon={<Star size={24} />} title="No reviews yet">Once customers work with you and leave a review, it will show up here.</EmptyState>
          )}
        </>
      )}
    </BusinessLayout>
  );
}

export { StarPicker };
