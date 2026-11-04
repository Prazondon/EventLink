/**
 * React bridge for the scrollcraft engine (public/scrollcraft/scrollcraft.js).
 *
 * The engine is shipped verbatim and never edited. It was written for static
 * pages, so `mount()` registers window listeners and rAF loops with no way to
 * tear them down. In a single-page app that would leak one engine per visit to
 * the landing page. `mountScoped` records exactly what the engine registers
 * during its synchronous `mount()` call and cancels it on unmount, so leaving
 * and returning to "/" never stacks instances.
 */
import { useEffect, type RefObject } from "react";

interface ScrollCraftInstance {
  layout: () => void;
  read: () => void;
}

interface ScrollCraftGlobal {
  mount: (root: Element) => ScrollCraftInstance;
  instances: ScrollCraftInstance[];
}

declare global {
  interface Window {
    ScrollCraft?: ScrollCraftGlobal;
  }
}

const ENGINE_SRC = "/scrollcraft/scrollcraft.js";
let enginePromise: Promise<ScrollCraftGlobal> | null = null;

function loadEngine(): Promise<ScrollCraftGlobal> {
  if (window.ScrollCraft) return Promise.resolve(window.ScrollCraft);
  enginePromise ??= new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = ENGINE_SRC;
    script.async = true;
    script.onload = () =>
      window.ScrollCraft ? resolve(window.ScrollCraft) : reject(new Error("scrollcraft did not register"));
    script.onerror = () => {
      enginePromise = null;
      reject(new Error("scrollcraft failed to load"));
    };
    document.head.appendChild(script);
  });
  return enginePromise;
}

// Frame callbacks belonging to unmounted engines. The engine's loops reschedule
// themselves with the same function reference, so dropping those references at
// the scheduler ends the loop.
const retiredFrames = new WeakSet<FrameRequestCallback>();
let frameGateInstalled = false;

function installFrameGate() {
  if (frameGateInstalled) return;
  const schedule = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = (callback) => (retiredFrames.has(callback) ? 0 : schedule(callback));
  frameGateInstalled = true;
}

type ListenerRecord = [string, EventListenerOrEventListenerObject, boolean | AddEventListenerOptions | undefined];

function mountScoped(engine: ScrollCraftGlobal, root: Element) {
  installFrameGate();
  const listeners: ListenerRecord[] = [];
  const frames: FrameRequestCallback[] = [];
  const addListener = EventTarget.prototype.addEventListener;
  const gatedFrame = window.requestAnimationFrame;

  window.addEventListener = function (type: string, listener: EventListenerOrEventListenerObject, options?: boolean | AddEventListenerOptions) {
    listeners.push([type, listener, options]);
    addListener.call(window, type, listener, options);
  } as typeof window.addEventListener;
  window.requestAnimationFrame = (callback) => {
    frames.push(callback);
    return gatedFrame(callback);
  };

  let instance: ScrollCraftInstance;
  try {
    instance = engine.mount(root);
  } finally {
    // addEventListener lives on EventTarget.prototype; deleting the own
    // property restores it. The frame gate is an own property, so reassign.
    delete (window as unknown as Record<string, unknown>).addEventListener;
    window.requestAnimationFrame = gatedFrame;
  }

  return {
    instance,
    unmount() {
      for (const [type, listener, options] of listeners) window.removeEventListener(type, listener, options);
      for (const frame of frames) retiredFrames.add(frame);
      engine.instances.splice(engine.instances.indexOf(instance), 1);
      document.documentElement.style.removeProperty("--sc-canvas");
      document.documentElement.classList.remove("sc-ready");
    },
  };
}

/** Mounts the engine on `rootRef` for the lifetime of the component. */
export function useScrollCraft(
  rootRef: RefObject<HTMLElement>,
  onMount?: (instance: ScrollCraftInstance) => void,
) {
  useEffect(() => {
    let cancelled = false;
    let teardown: (() => void) | undefined;
    loadEngine()
      .then((engine) => {
        if (cancelled || !rootRef.current) return;
        const scoped = mountScoped(engine, rootRef.current);
        teardown = scoped.unmount;
        onMount?.(scoped.instance);
      })
      .catch(() => {
        // Without the engine the page still renders as ordinary sections;
        // reveal anything that would otherwise wait for it.
        rootRef.current?.classList.add("sc-fallback");
      });
    return () => {
      cancelled = true;
      teardown?.();
    };
    // Mount once per page visit; the engine reads the DOM itself.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
