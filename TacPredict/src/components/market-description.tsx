import { useId, useState } from "react";
import { ChevronDown } from "lucide-react";
export function MarketDescription({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false);
  const id = useId();
  const value = text.trim() || "Description is not available from the source.";
  const long = value.length > 180;
  return (
    <section className="mt-8" aria-label="Market description">
      <h2 className="text-xl font-semibold tracking-tight">Description</h2>
      <p
        id={id}
        className={`mt-3 whitespace-pre-line text-sm leading-7 text-muted-foreground sm:text-base ${long && !expanded ? "line-clamp-3" : ""}`}
      >
        {value}
      </p>
      {long && (
        <button
          type="button"
          aria-expanded={expanded}
          aria-controls={id}
          onClick={() => setExpanded(!expanded)}
          className="ios-press mt-2 inline-flex min-h-11 items-center gap-2 text-sm font-medium text-[#57a6ff]"
        >
          {expanded ? "Show less" : "Show more"}
          <ChevronDown
            className={`size-4 transition-transform motion-reduce:transition-none ${expanded ? "rotate-180" : ""}`}
          />
        </button>
      )}
    </section>
  );
}
