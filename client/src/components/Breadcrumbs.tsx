import { ChevronLeft } from "lucide-react";
import { useLocation } from "wouter";
import type { BreadcrumbItem } from "@/lib/navigation";

type BreadcrumbsProps = {
  items: BreadcrumbItem[];
};

export function Breadcrumbs({ items }: BreadcrumbsProps) {
  const [, setLocation] = useLocation();
  if (items.length <= 1) return null;

  return (
    <nav aria-label="مسار التنقل" className="flex items-center gap-1 text-xs text-muted-foreground mb-3 no-print flex-wrap">
      {items.map((item, idx) => {
        const isLast = idx === items.length - 1;
        return (
          <span key={`${item.label}-${idx}`} className="flex items-center gap-1">
            {idx > 0 && <ChevronLeft className="h-3 w-3 rotate-180 opacity-50" />}
            {item.path && !isLast ? (
              <button
                type="button"
                onClick={() => setLocation(item.path!)}
                className="hover:text-foreground transition-colors"
              >
                {item.label}
              </button>
            ) : (
              <span className={isLast ? "text-foreground font-medium" : ""}>{item.label}</span>
            )}
          </span>
        );
      })}
    </nav>
  );
}
