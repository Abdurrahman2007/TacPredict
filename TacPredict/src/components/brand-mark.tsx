import { BRAND_LOGO_URL } from "@/lib/brand";
import { cn } from "@/lib/utils";

/** Canonical TacPredict mark — no dark plate or filters that wash brand colors. */
export function BrandMark({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "brand-object-mark inline-flex size-10 shrink-0 items-center justify-center overflow-visible",
        className,
      )}
      aria-hidden="true"
    >
      <img
        src={BRAND_LOGO_URL}
        width={64}
        height={64}
        className="h-full w-full object-contain"
        alt=""
        decoding="async"
      />
    </span>
  );
}
