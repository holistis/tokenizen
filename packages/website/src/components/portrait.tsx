import { HashMark } from "@/components/matrix/hash-mark";

// A portrait frame (4 by 5). With a photo the person gave us it shows the photo. Without one it shows a monogram on a pattern made from
// the name, which is also fine to look at. We never make up a picture of a person.

export function Portrait({ name, photo, alt }: { name: string; photo?: string; alt?: string }) {
  const initial = name.trim().charAt(0).toUpperCase();
  return (
    <div className="relative aspect-[4/5] w-full overflow-hidden rounded-md border border-border bg-muted">
      {photo ? (
        <img src={photo} alt={alt ?? name} width={800} height={1000} loading="lazy" decoding="async" className="size-full object-cover" />
      ) : (
        <>
          <HashMark seed={name} className="absolute inset-0 size-full text-[color:var(--altitude)] opacity-[0.16]" />
          <div aria-hidden="true" className="absolute inset-0 flex items-center justify-center">
            <span className="font-display text-[8rem] leading-none text-foreground sm:text-[9rem]">{initial}</span>
          </div>
          <span className="absolute bottom-2 left-3 font-mono text-[11px] uppercase tracking-wide text-muted-foreground">{name}</span>
        </>
      )}
    </div>
  );
}
