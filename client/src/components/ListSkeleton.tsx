import { Card, CardContent } from "@/components/ui/card";

export function StatsSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
      {Array.from({ length: count }).map((_, i) => (
        <Card key={i} className="animate-pulse">
          <CardContent className="p-4 md:p-5">
            <div className="h-3 w-20 bg-muted rounded mb-3" />
            <div className="h-8 w-16 bg-muted rounded" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export function CardListSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="space-y-3 md:hidden">
      {Array.from({ length: count }).map((_, i) => (
        <Card key={i} className="animate-pulse">
          <CardContent className="p-4 space-y-3">
            <div className="h-4 w-2/3 bg-muted rounded" />
            <div className="h-3 w-1/3 bg-muted rounded" />
            <div className="space-y-2 pt-2">
              <div className="h-3 w-full bg-muted rounded" />
              <div className="h-3 w-4/5 bg-muted rounded" />
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export function TableSkeleton({ rows = 5, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <div className="hidden md:block border rounded-lg overflow-hidden animate-pulse">
      <div className="h-10 bg-green-800/20" />
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex gap-4 p-3 border-t">
          {Array.from({ length: cols }).map((_, c) => (
            <div key={c} className="h-3 flex-1 bg-muted rounded" />
          ))}
        </div>
      ))}
    </div>
  );
}
