import type { ReactNode } from "react";
import { Search, SlidersHorizontal, ChevronDown } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useState } from "react";

type PageToolbarProps = {
  search?: string;
  onSearchChange?: (value: string) => void;
  searchPlaceholder?: string;
  filters?: ReactNode;
  actions?: ReactNode;
  className?: string;
};

export function PageToolbar({
  search,
  onSearchChange,
  searchPlaceholder = "بحث...",
  filters,
  actions,
  className = "",
}: PageToolbarProps) {
  const [filtersOpen, setFiltersOpen] = useState(false);
  const hasFilters = !!filters;
  const hasSearch = onSearchChange !== undefined;

  return (
    <Card className={`no-print ${className}`}>
      <CardContent className="p-3 sm:p-4 space-y-3">
        <div className="flex flex-wrap gap-2 items-center">
          {hasSearch && (
            <div className="flex-1 min-w-[160px] relative">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
              <Input
                placeholder={searchPlaceholder}
                value={search ?? ""}
                onChange={(e) => onSearchChange?.(e.target.value)}
                className="pr-9"
              />
            </div>
          )}
          {actions && <div className="flex flex-wrap gap-2 items-center shrink-0">{actions}</div>}
        </div>

        {hasFilters && (
          <>
            <Collapsible open={filtersOpen} onOpenChange={setFiltersOpen} className="md:hidden">
              <CollapsibleTrigger asChild>
                <Button variant="outline" size="sm" className="w-full justify-between">
                  <span className="flex items-center gap-2">
                    <SlidersHorizontal className="h-4 w-4" />
                    فلاتر
                  </span>
                  <ChevronDown className={`h-4 w-4 transition-transform ${filtersOpen ? "rotate-180" : ""}`} />
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="pt-3">
                <div className="flex flex-col gap-2">{filters}</div>
              </CollapsibleContent>
            </Collapsible>
            <div className="hidden md:flex flex-wrap gap-2 items-center">{filters}</div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
