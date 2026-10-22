import { BRAND_LOGO_URL } from "@/lib/brand";
import { cn } from "@/lib/utils";
export function BrandMark({ className }: { className?: string }) {
  return (
    <span
      className={cn("brand-object-mark inline-flex size-10 shrink-0", className)}
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
