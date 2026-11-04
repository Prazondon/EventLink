import { ArrowRight, Check, ChevronUp, Plus, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { Link } from "react-router-dom";
import { api } from "./api";
import { BusinessCard, Notice } from "./components";
import { useScrollCraft } from "./scrollcraft";
import type { Category, PublicBusiness } from "./types";

/* ------------------------------------------------------------------ data -- */

export const photo = (id: string, width = 1400) =>
  `https://images.unsplash.com/${id}?auto=format&fit=crop&w=${width}&q=80`;

const ENTRANCE = {
  plate: "photo-1519741497674-611481863552",
  work: "photo-1511795409834-ef04bbd61622",
  near: "photo-1530103862676-de8c9debad1d",
};

export interface Room {
  key: string;
  title: string;
  match: string[];
  covers: string;
  ask: string;
  photo: string;
  alt: string;
}

export const ROOMS: Room[] = [
  { key: "venues", title: "Venues", match: ["venue"], covers: "Halls, gardens, rooftops, private rooms", ask: "Capacity, curfew, in-house catering", photo: "photo-1519167758481-83f550bb49b3", alt: "A long dining hall set for a reception under warm pendant lights" },
  { key: "photography", title: "Photography", match: ["phot"], covers: "Stills, film, photo booths", ask: "Shot list, delivery time, second shooter", photo: "photo-1537633552985-df8429e8048b", alt: "A photographer framing a couple outdoors" },
  { key: "catering", title: "Catering", match: ["cater", "food"], covers: "Feasts, grazing tables, bar service", ask: "Dietary needs, staffing, tastings", photo: "photo-1555244162-803834f70033", alt: "A buffet of plated dishes ready for guests" },
  { key: "florals", title: "Florals", match: ["flor", "flower"], covers: "Arrangements, arches, table styling", ask: "Seasonal stems, set-up, take-down", photo: "photo-1523438885200-e635ba2c371e", alt: "A loose arrangement of garden flowers" },
  { key: "music", title: "Music", match: ["music", "dj", "band"], covers: "Bands, DJs, ceremony players", ask: "Set length, sound check, the first dance", photo: "photo-1501386761578-eac5c94b800a", alt: "A crowd with hands raised in front of a lit stage" },
  { key: "planning", title: "Planning", match: ["plan", "coordinat"], covers: "Full planning, day-of coordination", ask: "Timeline, suppliers, wet-weather plan", photo: "photo-1464366400600-7168b8af9bc3", alt: "A decorated table with place settings and candles" },
];

const roomByKey = new Map(ROOMS.map((room) => [room.key, room]));

/* ------------------------------------------------- running order store -- */
// The signature move. A tiny external store so the header, labels, ticket,
// salon and inquiry plate all read one list, persisted between visits.

const ORDER_KEY = "eventlink.runningOrder";
const orderListeners = new Set<() => void>();
let orderCache: string[] | null = null;

function readOrder(): string[] {
  if (orderCache) return orderCache;
  try {
    const parsed = JSON.parse(localStorage.getItem(ORDER_KEY) ?? "[]");
    orderCache = Array.isArray(parsed) ? parsed.filter((key) => roomByKey.has(key)) : [];
  } catch {
    orderCache = [];
  }
  return orderCache;
}

function writeOrder(next: string[]) {
  orderCache = next;
  localStorage.setItem(ORDER_KEY, JSON.stringify(next));
  orderListeners.forEach((listener) => listener());
}

function useRunningOrder() {
  const order = useSyncExternalStore(
    (listener) => {
      orderListeners.add(listener);
      return () => orderListeners.delete(listener);
    },
    readOrder,
  );
  const toggle = useCallback((key: string) => {
    const current = readOrder();
    writeOrder(current.includes(key) ? current.filter((item) => item !== key) : [...current, key]);
  }, []);
  return { order, toggle };
}

/* ----------------------------------------------------- room index (nav) -- */
// Gallery grammar: the nav is an index of the objects, and it jumps.

const roomListeners = new Set<() => void>();
let currentRoom = "";
function setCurrentRoom(key: string) {
  if (key === currentRoom) return;
  currentRoom = key;
  roomListeners.forEach((listener) => listener());
}

export function useCurrentRoom() {
  return useSyncExternalStore(
    (listener) => {
      roomListeners.add(listener);
      return () => roomListeners.delete(listener);
    },
    () => currentRoom,
  );
}

const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Rooms live inside horizontally panning acts, so a plain anchor jump would
 *  land on the act, not the room. Work out the vertical scroll that brings the
 *  room to the centre of the rail. */
export function jumpToRoom(key: string) {
  const room = document.getElementById(`room-${key}`);
  const act = room?.closest<HTMLElement>('[data-sc-act="pan"]');
  const rail = act?.querySelector<HTMLElement>("[data-sc-pan]");
  if (!room || !act || !rail) return;
  const actTop = act.getBoundingClientRect().top + window.scrollY;
  if (reducedMotion() || !document.documentElement.classList.contains("sc-ready")) {
    window.scrollTo({ top: actTop, behavior: "auto" });
    room.scrollIntoView({ block: "nearest", inline: "center" });
    return;
  }
  const overflow = (rail.scrollWidth - window.innerWidth) * (1 + (parseFloat(rail.dataset.scPan ?? "0") || 0));
  const target = room.offsetLeft + room.offsetWidth / 2 - window.innerWidth / 2;
  const progress = overflow > 0 ? Math.min(1, Math.max(0, target / overflow)) : 0;
  window.scrollTo({ top: actTop + progress * (act.offsetHeight - window.innerHeight), behavior: "smooth" });
  room.querySelector<HTMLElement>(".g-label__toggle")?.focus({ preventScroll: true });
}

export function RoomIndex({ onNavigate }: { onNavigate?: () => void }) {
  const active = useCurrentRoom();
  const { order } = useRunningOrder();
  return (
    <>
      {ROOMS.map((room) => (
        <a
          key={room.key}
          href={`#room-${room.key}`}
          className={`room-link${active === room.key ? " is-current" : ""}${order.includes(room.key) ? " is-pinned" : ""}`}
          aria-current={active === room.key ? "location" : undefined}
          onClick={(event) => {
            event.preventDefault();
            onNavigate?.();
            jumpToRoom(room.key);
          }}
        >
          {room.title}
        </a>
      ))}
    </>
  );
}

/* ----------------------------------------------------------- the page -- */

interface RoomStatus {
  category?: Category;
  count: number | null;
}

function useRoomStatus() {
  const [status, setStatus] = useState<Record<string, RoomStatus>>({});
  useEffect(() => {
    let active = true;
    api.categories()
      .then(async (categories) => {
        const entries = await Promise.all(
          ROOMS.map(async (room): Promise<[string, RoomStatus]> => {
            const category = categories.find((item) =>
              room.match.some((word) => item.name.toLowerCase().includes(word)),
            );
            if (!category) return [room.key, { count: 0 }];
            const listings = await api
              .businesses(new URLSearchParams({ category_id: category.id, limit: "100" }))
              .catch(() => null);
            return [room.key, { category, count: listings ? listings.length : null }];
          }),
        );
        if (active) setStatus(Object.fromEntries(entries));
      })
      .catch(() => {
        if (active) setStatus(Object.fromEntries(ROOMS.map((room) => [room.key, { count: null }])));
      });
    return () => {
      active = false;
    };
  }, []);
  return status;
}

function roomHref(room: Room, status?: RoomStatus) {
  return status?.category
    ? `/discover?category_id=${status.category.id}`
    : `/discover?q=${encodeURIComponent(room.match[0])}`;
}

function listingLine(status?: RoomStatus) {
  if (!status) return "Checking listings";
  if (status.count === null) return "Listings unavailable right now";
  if (status.count === 0) return "Opening soon";
  const shown = status.count >= 100 ? "100+" : String(status.count);
  return `${shown} live ${status.count === 1 ? "listing" : "listings"}`;
}

function Exhibit({ room, status }: { room: Room; status?: RoomStatus }) {
  const { order, toggle } = useRunningOrder();
  const pinned = order.includes(room.key);
  return (
    <article className="g-exhibit" id={`room-${room.key}`} aria-labelledby={`room-${room.key}-title`}>
      <div className={`g-frame g-exhibit__frame${pinned ? " is-pinned" : ""}`} data-sc-tilt="5">
        <img src={photo(room.photo, 1100)} alt={room.alt} width={1100} height={1375} loading="lazy" decoding="async" />
      </div>
      <div className="g-label">
        <h3 id={`room-${room.key}-title`}>{room.title}</h3>
        <dl>
          <div><dt>Covers</dt><dd>{room.covers}</dd></div>
          <div><dt>Ask about</dt><dd>{room.ask}</dd></div>
          <div><dt>On EventLink</dt><dd className="sc-nums">{listingLine(status)}</dd></div>
        </dl>
        <div className="g-label__actions">
          <button
            type="button"
            className="g-label__toggle"
            aria-pressed={pinned}
            aria-label={`Pin ${room.title} to running order`}
            onClick={() => toggle(room.key)}
          >
            {pinned ? <Check size={15} /> : <Plus size={15} />}
            {pinned ? "On your running order" : "Add to running order"}
          </button>
          <Link className="g-label__link" to={roomHref(room, status)}>
            Browse {room.title.toLowerCase()} <ArrowRight size={14} />
          </Link>
        </div>
      </div>
    </article>
  );
}

function RoomRail({ rooms, status, id, lead, note }: {
  rooms: Room[];
  status: Record<string, RoomStatus>;
  id: string;
  lead: React.ReactNode;
  note: React.ReactNode;
}) {
  return (
    <section data-sc-act="pan" data-sc-span="3.2" className={`g-wall g-rooms g-rooms--${id}`} aria-label={rooms.map((room) => room.title).join(", ")}>
      <div data-sc-stage className="g-rooms__stage">
        <div className="g-rail" data-sc-pan="0.04">
          <div className="g-rail__lead">{lead}</div>
          {rooms.map((room, index) => (
            <div className="g-rail__item" style={{ "--i": index + 1 } as React.CSSProperties} key={room.key}>
              <Exhibit room={room} status={status[room.key]} />
            </div>
          ))}
          <p className="g-rail__note">{note}</p>
        </div>
      </div>
    </section>
  );
}

// Salon hang: desktop and phone grid placement, plus where each work starts
// before it converges onto the wall (vw / vh offsets, extra scale, delay).
const HANG: { key: string; area: string; areaM: string; x: number; y: number; z: number; d: number }[] = [
  { key: "entrance", area: "1 / 1 / 4 / 4", areaM: "1 / 1 / 3 / 4", x: -38, y: -30, z: 0.5, d: 0.02 },
  { key: "venues", area: "1 / 4 / 3 / 7", areaM: "1 / 4 / 2 / 7", x: -6, y: -46, z: 0.7, d: 0.08 },
  { key: "music", area: "1 / 7 / 4 / 10", areaM: "3 / 1 / 4 / 4", x: 30, y: -40, z: 0.45, d: 0.04 },
  { key: "photography", area: "1 / 10 / 3 / 13", areaM: "2 / 4 / 4 / 7", x: 44, y: -24, z: 0.6, d: 0.12 },
  { key: "catering", area: "3 / 10 / 7 / 13", areaM: "7 / 1 / 9 / 3", x: 46, y: 22, z: 0.55, d: 0.06 },
  { key: "florals", area: "4 / 7 / 7 / 10", areaM: "7 / 3 / 9 / 5", x: 18, y: 44, z: 0.65, d: 0.1 },
  { key: "planning", area: "4 / 1 / 7 / 4", areaM: "7 / 5 / 9 / 7", x: -44, y: 30, z: 0.5, d: 0.14 },
];

function Salon({ order }: { order: string[] }) {
  const picked = order.map((key) => roomByKey.get(key)?.title).filter(Boolean) as string[];
  return (
    <section data-sc-act="pin" data-sc-span="4" className="g-wall g-salon" id="salon" aria-labelledby="salon-title">
      <div data-sc-stage className="g-salon__stage">
        <div className={`g-salon__grid${picked.length ? " has-picks" : ""}`}>
          {HANG.map((work) => {
            const room = roomByKey.get(work.key);
            const id = room ? room.photo : ENTRANCE.work;
            return (
              <div
                key={work.key}
                aria-hidden="true"
                className={`g-salon__work${order.includes(work.key) ? " is-pinned" : ""}`}
                style={{ "--area": work.area, "--area-m": work.areaM, "--x": work.x, "--y": work.y, "--z": work.z, "--d": work.d } as React.CSSProperties}
              >
                <div className="g-frame"><img src={photo(id, 900)} alt="" loading="lazy" decoding="async" /></div>
              </div>
            );
          })}
          <div className="g-salon__plate" data-sc-cue="0.46 1 0.18 0.1">
            <h2 id="salon-title">All of it, on one wall.</h2>
            <p>
              {picked.length
                ? `Your running order is lit: ${joinTitles(picked)}. The rest are here when you want them.`
                : "Every room, hung together. Add a few to your running order and they light up here."}
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

function joinTitles(titles: string[]) {
  if (titles.length < 2) return titles.join("");
  return `${titles.slice(0, -1).join(", ")} and ${titles[titles.length - 1]}`;
}

/** The signature move's chrome: a ticket stub in the header that collects
 *  the rooms pinned on the walk. Lives in fixed chrome so it never covers an
 *  exhibit or its controls. */
export function RunningOrderTicket() {
  const { order, toggle } = useRunningOrder();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent | KeyboardEvent) => {
      if (event instanceof KeyboardEvent ? event.key === "Escape" : !ref.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);
  return (
    <div className="g-ticket" ref={ref}>
      <button type="button" className="g-ticket__head" aria-expanded={open} aria-controls="running-order" onClick={() => setOpen(!open)}>
        <span>Running order</span>
        <span className="g-ticket__count sc-nums" aria-label={`${order.length} pinned`}>{order.length}</span>
        <ChevronUp className="g-ticket__chev" size={15} aria-hidden="true" />
      </button>
      <div className="g-ticket__body" id="running-order" hidden={!open}>
        {order.length ? (
          <ol>
            {order.map((key) => {
              const room = roomByKey.get(key)!;
              return (
                <li key={key}>
                  <button type="button" className="g-ticket__jump" onClick={() => { setOpen(false); jumpToRoom(key); }}>{room.title}</button>
                  <button type="button" className="g-ticket__remove" aria-label={`Remove ${room.title}`} onClick={() => toggle(key)}>
                    <X size={14} />
                  </button>
                </li>
              );
            })}
          </ol>
        ) : (
          <p>Pin rooms as you walk. They collect here, in order, and print on your inquiry at the end.</p>
        )}
        <a className="g-ticket__inquiry" href="#inquiry" onClick={() => setOpen(false)}>Go to your inquiry <ArrowRight size={14} /></a>
      </div>
    </div>
  );
}

export default function LandingPage() {
  const rootRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<{ layout: () => void } | null>(null);
  const status = useRoomStatus();
  const { order, toggle } = useRunningOrder();
  const [listings, setListings] = useState<PublicBusiness[] | null>(null);
  const [listingError, setListingError] = useState("");

  useScrollCraft(rootRef, (instance) => {
    engineRef.current = instance;
    // Act heights only exist once the engine has laid out; re-read the room.
    window.dispatchEvent(new Event("resize"));
  });

  useEffect(() => {
    api.businesses(new URLSearchParams({ sort: "rating", limit: "6" }))
      .then(setListings)
      .catch((reason: unknown) => setListingError(reason instanceof Error ? reason.message : "Listings are unavailable."));
  }, []);

  // The close section grows when listings arrive; re-measure act positions.
  useEffect(() => {
    engineRef.current?.layout();
  }, [listings, listingError]);

  // Track which room is in front of the visitor for the header index.
  useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      const centre = window.innerWidth / 2;
      let best = "";
      let bestDistance = Infinity;
      for (const room of ROOMS) {
        const rect = document.getElementById(`room-${room.key}`)?.getBoundingClientRect();
        if (!rect || rect.bottom < 0 || rect.top > window.innerHeight || rect.right < 0 || rect.left > window.innerWidth) continue;
        const distance = Math.abs(rect.left + rect.width / 2 - centre);
        if (distance < bestDistance) {
          bestDistance = distance;
          best = room.key;
        }
      }
      setCurrentRoom(best);
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
    update();
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      cancelAnimationFrame(frame);
      setCurrentRoom("");
    };
  }, []);

  const firstPick = order[0] ? roomByKey.get(order[0]) : undefined;
  const discoverHref = useMemo(
    () => (firstPick ? roomHref(firstPick, status[firstPick.key]) : "/discover"),
    [firstPick, status],
  );

  return (
    <div className="gallery" ref={rootRef}>
      <div className="sc-grain" aria-hidden="true" />

      {/* 1. Entrance: the first exhibit, already lit and labelled. */}
      <section data-sc-act="pin" data-sc-span="2" className="g-wall g-hero" aria-labelledby="hero-title">
        <div data-sc-stage className="g-hero__stage">
          <div className="g-hero__plate" data-sc-parallax="-1.3" aria-hidden="true">
            <img src={photo(ENTRANCE.plate, 1800)} alt="" {...{ fetchpriority: "high" }} decoding="async" />
          </div>
          <p className="g-hero__mark" data-sc-parallax="-0.7" aria-hidden="true">eventlink</p>
          <figure className="g-hero__work" data-sc-parallax="0.35">
            <div className="g-hero__work-inner">
              <div className="g-frame g-hero__frame">
                <img src={photo(ENTRANCE.work, 1000)} alt="A reception table dressed with candles and flowers" {...{ fetchpriority: "high" }} decoding="async" />
              </div>
              <figcaption className="g-label g-label--small">
                <strong>The long table</strong>
                <span>Venue, catering, florals. Saturday, late.</span>
              </figcaption>
            </div>
          </figure>
          <div className="g-hero__near" data-sc-parallax="1.5" aria-hidden="true">
            <div className="g-frame"><img src={photo(ENTRANCE.near, 700)} alt="" decoding="async" /></div>
          </div>
          <div className="g-hero__copy" data-sc-cue="0 0.9 0 0.25">
            <h1 id="hero-title">Every celebration is a collection.</h1>
            <p>Walk the rooms, pin what you love, and meet the local professionals who make it happen.</p>
            <div className="g-hero__actions">
              <Link className="button button-accent" to="/discover">Find your people <ArrowRight size={17} /></Link>
              <Link className="g-hero__aside" to="/register?role=business">List your business</Link>
            </div>
          </div>
        </div>
      </section>

      {/* 2. Rooms I to III */}
      <RoomRail
        id="one"
        rooms={ROOMS.slice(0, 3)}
        status={status}
        lead={<><h2>The rooms</h2><p>One profession per room. Read the label, pin the ones your day needs.</p></>}
        note="A pause next, then three more rooms."
      />

      {/* 3. Pause: authored silence before the second walk. */}
      <section data-sc-act="flow" className="g-wall g-pause" id="how-it-works" aria-labelledby="pause-title">
        <div className="sc-wrap g-pause__inner">
          <figure className="g-pause__figure" data-sc-reveal="up" data-sc-reveal-at="0.12 0.5">
            <img src={photo(ENTRANCE.plate, 1600)} alt="Guests gathered at an outdoor celebration under string lights" width={1600} height={1067} loading="lazy" decoding="async" />
          </figure>
          <div className="g-pause__copy sc-stack" data-sc-in data-sc-stagger="70">
            <h2 id="pause-title">How the walk works.</h2>
            <p><strong>Browse by room.</strong> Every profession has its own space and the same plain label.</p>
            <p><strong>Pin as you go.</strong> Your running order keeps the rooms you need, in the order you chose.</p>
            <p><strong>Reach out when it feels right.</strong> Verified professionals hear from you, with your consent.</p>
          </div>
        </div>
      </section>

      {/* 4. Rooms IV to VI */}
      <RoomRail
        id="two"
        rooms={ROOMS.slice(3)}
        status={status}
        lead={<><h2>Three more rooms</h2><p>Flowers, sound and the people who keep the day on time.</p></>}
        note="Next: everything, on one wall."
      />

      {/* 5. Peak: the salon hang. */}
      <Salon order={order} />

      {/* 6. Close: real professionals, then the inquiry plate. */}
      <section data-sc-act="flow" className="g-wall g-close" aria-labelledby="close-title">
        <div className="sc-wrap">
          <div className="g-close__head" data-sc-in>
            <h2 id="close-title">Now showing</h2>
            <p>Verified professionals with live listings, highest rated first.</p>
          </div>
          {listingError && <Notice>{listingError}</Notice>}
          {listings && listings.length > 0 && (
            <div className="business-grid g-close__grid">
              {listings.map((business, index) => (
                <BusinessCard business={business} index={index} key={business.business.id} />
              ))}
            </div>
          )}
          {listings?.length === 0 && (
            <p className="g-close__empty">The first verified listings are being hung. The directory opens as they arrive.</p>
          )}

          <div className="g-plate" id="inquiry" aria-labelledby="inquiry-title">
            <h2 id="inquiry-title">Inquiry</h2>
            <dl>
              <div>
                <dt>Your running order</dt>
                <dd>
                  {order.length ? (
                    <ol className="g-plate__order">
                      {order.map((key) => {
                        const room = roomByKey.get(key)!;
                        return (
                          <li key={key}>
                            <Link to={roomHref(room, status[key])}>{room.title}</Link>
                            <button type="button" aria-label={`Remove ${room.title}`} onClick={() => toggle(key)}><X size={13} /></button>
                          </li>
                        );
                      })}
                    </ol>
                  ) : (
                    "Nothing pinned yet. Start with everyone, or walk back through the rooms."
                  )}
                </dd>
              </div>
              <div>
                <dt>Next</dt>
                <dd>
                  <Link className="button button-accent" to={discoverHref}>Find your people <ArrowRight size={17} /></Link>
                </dd>
              </div>
              <div>
                <dt>For professionals</dt>
                <dd><Link className="g-plate__link" to="/register?role=business">List your business</Link> and get verified.</dd>
              </div>
            </dl>
          </div>
        </div>
      </section>

    </div>
  );
}
