import { useEffect, useRef, type CSSProperties, type PointerEvent, type ReactNode } from "react";

import { useLocale } from "@/i18n/context";
import { localePath } from "@/lib/locale-paths";

// The building blocks of the cinematic pages: a full-bleed photograph with depth, dust that drifts in front of it, glass cards that tilt toward the
// pointer, and a reveal when a block scrolls into view. The photographs are illustrations made with AI and are labelled as such on the page.
// Everything moves only when the reader has not asked for reduced motion, and everything is readable without JavaScript.

const reduced = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export const IMAGE_WIDTH = 1376;
export const IMAGE_HEIGHT = 768;

/** A decorative photograph: two sizes so a phone does not download the large one. The text around it carries the meaning, so the alt is empty. */
export function Photo({ name, eager = false, className }: { name: string; eager?: boolean; className?: string }) {
  return (
    <img
      src={`/media/site/${name}.webp`}
      srcSet={`/media/site/${name}-768.webp 768w, /media/site/${name}.webp ${IMAGE_WIDTH}w`}
      sizes="100vw"
      width={IMAGE_WIDTH}
      height={IMAGE_HEIGHT}
      alt=""
      decoding="async"
      loading={eager ? "eager" : "lazy"}
      {...(eager ? ({ fetchpriority: "high" } as Record<string, string>) : {})}
      className={className}
    />
  );
}

/** Sets --p (-1 above the screen, 0 in the middle, 1 below) on the element while it scrolls, for the depth of the photograph behind it. */
export function useDepth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || reduced()) return;
    let raf = 0;
    const update = () => {
      raf = 0;
      const r = el.getBoundingClientRect();
      const vh = window.innerHeight;
      const p = (r.top + r.height / 2 - vh / 2) / (vh / 2 + r.height / 2);
      el.style.setProperty("--p", Math.max(-1, Math.min(1, p)).toFixed(3));
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);
  return ref;
}

/** Fades a block in once, when it first scrolls into view. Without JavaScript or with reduced motion it is simply there. */
export function useReveal<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || reduced() || typeof IntersectionObserver === "undefined") return;
    // A block that is already on screen when the page opens must not blink (visible, hidden, faded back in): it stays as it is.
    // Only blocks below the fold fade in when they scroll into view.
    if (el.getBoundingClientRect().top < window.innerHeight) return;
    el.dataset.armed = "true";
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          el.dataset.in = "true";
          io.disconnect();
        }
      },
      { threshold: 0.15 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return ref;
}

/** Light dust in front of the first photograph. A canvas of a few dozen dots, paused when it is off screen or the tab is hidden. */
export function Dust() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const still = reduced();
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    const count = window.innerWidth < 768 ? 34 : 80;
    const dots = Array.from({ length: count }, () => ({
      x: Math.random(),
      y: Math.random(),
      z: Math.random(),
      r: Math.random() * 1.5 + 0.5,
      v: Math.random() * 0.00004 + 0.00002,
      c: Math.random() < 0.7 ? "245,165,36" : "63,214,196",
    }));
    let w = 0;
    let h = 0;
    let raf = 0;
    let visible = true;
    let mx = 0;
    const size = () => {
      w = canvas.clientWidth;
      h = canvas.clientHeight;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    const draw = (t: number) => {
      ctx.clearRect(0, 0, w, h);
      for (const d of dots) {
        if (!still) {
          d.y -= d.v * (0.5 + d.z) * 16;
          if (d.y < -0.02) {
            d.y = 1.02;
            d.x = Math.random();
          }
        }
        const x = d.x * w + Math.sin(t * 0.0003 + d.z * 9) * 12 + mx * d.z * 36;
        ctx.beginPath();
        ctx.fillStyle = `rgba(${d.c},${(0.15 + 0.55 * d.z).toFixed(2)})`;
        ctx.arc(x, d.y * h, d.r * (0.6 + d.z), 0, Math.PI * 2);
        ctx.fill();
      }
    };
    const loop = (t: number) => {
      draw(t);
      raf = visible && !document.hidden ? requestAnimationFrame(loop) : 0;
    };
    const wake = () => {
      if (!raf && visible && !document.hidden && !still) raf = requestAnimationFrame(loop);
    };
    const onPointer = (e: globalThis.PointerEvent) => {
      mx = e.clientX / window.innerWidth - 0.5;
    };
    size();
    draw(0);
    const io = new IntersectionObserver((entries) => {
      visible = entries.some((e) => e.isIntersecting);
      wake();
    });
    io.observe(canvas);
    if (!still) {
      window.addEventListener("pointermove", onPointer, { passive: true });
      document.addEventListener("visibilitychange", wake);
    }
    window.addEventListener("resize", size);
    return () => {
      if (raf) cancelAnimationFrame(raf);
      io.disconnect();
      window.removeEventListener("pointermove", onPointer);
      document.removeEventListener("visibilitychange", wake);
      window.removeEventListener("resize", size);
    };
  }, []);
  return <canvas ref={ref} aria-hidden="true" style={{ zIndex: -2 }} className="absolute inset-0 h-full w-full" />;
}

/** The hero: a full-screen photograph that drifts slowly and shifts a little with the pointer, with dust in front. */
export function CinemaHero({ image, children }: { image: string; children: ReactNode }) {
  const ref = useDepth<HTMLElement>();
  function onMove(e: PointerEvent<HTMLElement>) {
    if (e.pointerType !== "mouse" || reduced()) return;
    const r = e.currentTarget.getBoundingClientRect();
    e.currentTarget.style.setProperty("--mx", ((e.clientX - r.left) / r.width - 0.5).toFixed(3));
    e.currentTarget.style.setProperty("--my", ((e.clientY - r.top) / r.height - 0.5).toFixed(3));
  }
  return (
    <section id="top" ref={ref} onPointerMove={onMove} className="hero">
      <div className="hero-media" aria-hidden="true">
        <Photo name={image} eager className="hero-img" />
      </div>
      <Dust />
      <div className="hero-shade" aria-hidden="true" />
      <div className="container relative">{children}</div>
    </section>
  );
}

/** A full-bleed photograph with the text on a pane of dark glass, on the left or on the right. */
export function Scene({
  id,
  image,
  side = "left",
  label,
  wide = false,
  children,
}: {
  id: string;
  image: string;
  side?: "left" | "right";
  label: string;
  wide?: boolean;
  children: ReactNode;
}) {
  const ref = useDepth<HTMLElement>();
  const reveal = useReveal<HTMLDivElement>();
  return (
    <section id={id} ref={ref} aria-label={label} className="scene">
      <div className="scene-media" aria-hidden="true">
        <Photo name={image} className="scene-img" />
      </div>
      <div className="scene-shade" data-side={side} aria-hidden="true" />
      <div className="container relative">
        <div ref={reveal} className={`reveal glass ${wide ? "max-w-3xl" : "max-w-xl"} ${side === "right" ? "ml-auto" : ""}`}>
          {children}
        </div>
      </div>
    </section>
  );
}

/** A card of glass that tilts toward the mouse and lets a light follow it. Touch and reduced motion get a flat card. */
export function Tilt({ children, className = "", as: Tag = "div" }: { children: ReactNode; className?: string; as?: "div" | "article" }) {
  function onMove(e: PointerEvent<HTMLElement>) {
    if (e.pointerType !== "mouse") return;
    const el = e.currentTarget;
    const r = el.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width;
    const y = (e.clientY - r.top) / r.height;
    el.style.setProperty("--ry", `${((x - 0.5) * 9).toFixed(2)}deg`);
    el.style.setProperty("--rx", `${(-(y - 0.5) * 7).toFixed(2)}deg`);
    el.style.setProperty("--gx", `${(x * 100).toFixed(1)}%`);
    el.style.setProperty("--gy", `${(y * 100).toFixed(1)}%`);
  }
  function onLeave(e: PointerEvent<HTMLElement>) {
    const el = e.currentTarget;
    el.style.setProperty("--ry", "0deg");
    el.style.setProperty("--rx", "0deg");
  }
  const style: CSSProperties = {};
  return (
    <Tag onPointerMove={onMove} onPointerLeave={onLeave} style={style} className={`tilt ${className}`}>
      {children}
    </Tag>
  );
}

/** The head of a subpage: the same photograph and pane of glass as the homepage, shorter. The one h1 of the page lives here. */
export function PageHero({ image, chip, title, lead }: { image: string; chip: string; title: string; lead: string }) {
  const ref = useDepth<HTMLElement>();
  const reveal = useReveal<HTMLDivElement>();
  const { locale } = useLocale();
  return (
    <section ref={ref} className="subhero">
      <div className="scene-media" aria-hidden="true">
        <Photo name={image} eager className="scene-img" />
      </div>
      <div className="subhero-shade" aria-hidden="true" />
      <div className="container relative">
        <div ref={reveal} className="reveal glass max-w-3xl">
          <a href={localePath(locale, "/")} className="block w-fit font-mono text-xs uppercase tracking-[0.2em] text-white/70 hover:text-white">
            tokenizen.nl
          </a>
          <p className="mt-5 inline-flex w-fit rounded-full border border-white/20 px-3 py-0.5 font-mono text-[11px] uppercase tracking-wide text-[color:var(--glow)]">{chip}</p>
          <h1 className="mt-4 font-display text-4xl leading-[1.05] sm:text-5xl md:text-6xl">{title}</h1>
          <p className="mt-5 max-w-2xl text-base leading-relaxed text-white/90 md:text-lg">{lead}</p>
        </div>
      </div>
    </section>
  );
}

/** A subpage: a dark page with a photograph at the top and the content below it. */
export function CinemaPage({ image, chip, title, lead, children }: { image: string; chip: string; title: string; lead: string; children: ReactNode }) {
  return (
    <div className="cinema">
      <PageHero image={image} chip={chip} title={title} lead={lead} />
      <div className="container py-12 md:py-16">{children}</div>
    </div>
  );
}
