import { lazy, Suspense } from "react";

const DashboardMap = lazy(() => import("@/components/DashboardMap"));

function MapFallback() {
  return (
    <div className="min-h-[50vh] flex items-center justify-center">
      <p className="text-muted-foreground text-sm">جاري تحميل الخريطة...</p>
    </div>
  );
}

export default function CasesMap() {
  return (
    <div className="space-y-4">
      <Suspense fallback={<MapFallback />}>
        <DashboardMap />
      </Suspense>
    </div>
  );
}
