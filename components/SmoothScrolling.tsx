'use client';

import { useEffect, useRef, useCallback } from 'react';

export default function SmoothScroll({
  children
}: {
  children: React.ReactNode;
}) {
  const contentRef = useRef<HTMLDivElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const current = useRef(0);
  const target = useRef(0);
  const ease = 0.12; // lower = smoother/slower

  const onResize = useCallback(() => {
    if (!contentRef.current) return;
    // Set body height to content height so the native scrollbar reflects content
    document.body.style.height = `${contentRef.current.scrollHeight}px`;
  }, []);

  useEffect(() => {
    const content = contentRef.current;
    if (!content) return;

    // initialize
    onResize();
    target.current = window.scrollY;
    current.current = window.scrollY;

    const onScroll = () => {
      target.current = window.scrollY;
      // ensure RAF loop runs
      if (rafRef.current === null) rafRef.current = requestAnimationFrame(render);
    };

    const render = () => {
      // interpolate
      current.current += (target.current - current.current) * ease;

      // round to avoid subpixel jitter
      const rounded = Math.round(current.current * 100) / 100;

      if (content) content.style.transform = `translate3d(0,-${rounded}px,0)`;

      const delta = Math.abs(target.current - current.current);
      if (delta > 0.5) {
        rafRef.current = requestAnimationFrame(render);
      } else {
        // stop the loop
        rafRef.current = null;
      }
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onResize);

    // kickstart
    rafRef.current = requestAnimationFrame(render);

    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onResize);
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      // reset any styles we changed
      if (content) content.style.transform = '';
      document.body.style.height = '';
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onResize]);

  return (
    <div style={{ position: 'relative' }}>
      <div ref={contentRef} style={{ transform: 'translate3d(0,0,0)', willChange: 'transform' }}>
        {children}
      </div>
    </div>
  );
}
