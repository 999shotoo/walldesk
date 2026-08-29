"use client";
import { useRef, startTransition, useEffect } from "react";
import { gsap } from "gsap";
import { TransitionRouter } from "next-transition-router";

/** Fade duration. Seconds, because that is gsap's unit. */
const FADE_S = 0.2;

/**
 * How long to wait for a fade before navigating anyway, in ms. Comfortably
 * longer than the fade, short enough that a stall never reads as a hang.
 */
const RELEASE_TIMEOUT_MS = 600;

/**
 * Wrap a callback so only the first call gets through.
 *
 * The animation and its backstop timer both release the same navigation, and
 * `next-transition-router` has to see that release exactly once.
 */
function once(fn: () => void): () => void {
  let done = false;
  return () => {
    if (done) return;
    done = true;
    fn();
  };
}

/**
 * Whether an animation would be seen by anyone.
 *
 * gsap's ticker runs on requestAnimationFrame, which browsers suspend outright
 * while a page is hidden — a minimised window, a background tab, an offscreen
 * webview. Animating there does not just waste work: `leave` only performs the
 * route change when its `onComplete` fires, so a click that lands while hidden
 * would never navigate, and the router would sit in its `leaving` stage
 * afterwards swallowing every click that followed.
 */
function animationsVisible(): boolean {
  return typeof document === "undefined" || !document.hidden;
}

export function PageTransitionProvider({ children }: { children: React.ReactNode }) {
  const contentRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!contentRef.current || !animationsVisible()) return;
    // `clearProps` so the fade leaves no inline opacity behind to strand the
    // content at a stale value.
    gsap.fromTo(
      contentRef.current,
      { opacity: 0 },
      { opacity: 1, duration: 0.4, ease: "power1.inOut", clearProps: "opacity" }
    );
  }, []);

  return (
    <TransitionRouter
      auto={true}
      leave={(next) => {
        // Released by whichever comes first, the fade or the timer. Nothing is
        // gated on the fade alone.
        const release = once(next);

        if (!animationsVisible()) {
          release();
          return;
        }

        const timer = window.setTimeout(release, RELEASE_TIMEOUT_MS);
        const tl = gsap.timeline({ onComplete: release }).to(contentRef.current, {
          opacity: 0,
          duration: FADE_S,
          ease: "power1.inOut",
        });

        return () => {
          window.clearTimeout(timer);
          tl.kill();
        };
      }}
      enter={(next) => {
        const release = once(() => startTransition(next));

        if (!animationsVisible()) {
          release();
          return;
        }

        const timer = window.setTimeout(release, RELEASE_TIMEOUT_MS);
        const tl = gsap.timeline().fromTo(
          contentRef.current,
          {
            opacity: 0,
          },
          {
            opacity: 1,
            duration: FADE_S,
            ease: "power1.inOut",
            clearProps: "opacity",
            onComplete: release,
          }
        );

        return () => {
          window.clearTimeout(timer);
          tl.kill();
        };
      }}
    >
      <div ref={contentRef}>
        {children}
      </div>
    </TransitionRouter>
  );
}
