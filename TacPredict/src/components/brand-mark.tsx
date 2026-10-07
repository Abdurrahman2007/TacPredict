import { cn } from "@/lib/utils";
export function BrandMark({ className }: { className?: string }) {
  return (
    <span
      className={cn("inline-flex size-10 shrink-0 overflow-hidden rounded-xl", className)}
      aria-hidden="true"
    >
      <img
        src="/brand/tacpredict.svg"
        width={64}
        height={64}
        className="h-full w-full object-cover"
        alt=""
        decoding="async"
      />
    </span>
  );
}
