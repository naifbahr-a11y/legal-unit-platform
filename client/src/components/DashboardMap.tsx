import { useState, useMemo, useRef, useCallback, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import {
  MapPin, BarChart3, Filter, Calendar, X, Layers, Building2,
  ZoomIn, ZoomOut, RotateCcw, Download, Printer, List, Map as MapIcon,
  TrendingUp, TrendingDown, AlertTriangle, ChevronUp, ChevronDown, Navigation,
} from "lucide-react";
import { TOTAL_BRANCH_COUNT } from "../../../shared/rafidainBranches";
import { getSortedBranchesByGovernorate, getBranchCaseCount, getBranchDisplayLabel } from "../../../shared/branchUtils";
import { APP_LOGO_URL } from "@/const";
import { IRAQ_PROVINCE_PATHS, MAP_VIEWBOX } from "@/data/iraqProvincePaths";
import { MAP_ALERT_PROCESSING_THRESHOLD } from "../../../shared/mapUtils";
import { useLocation } from "wouter";
import { useIsMobile } from "@/hooks/useMobile";
import { EmptyState } from "@/components/EmptyState";

const LEVEL_COLORS = {
  veryHigh: "#0d2b0d",
  high: "#1a4d1a",
  medium: "#2d7a2d",
  low: "#5aad5a",
  veryLow: "#9dd49d",
};

const LEVEL_LABELS = [
  { key: "veryHigh", label: "مرتفع جداً", color: LEVEL_COLORS.veryHigh },
  { key: "high", label: "مرتفع", color: LEVEL_COLORS.high },
  { key: "medium", label: "متوسط", color: LEVEL_COLORS.medium },
  { key: "low", label: "منخفض", color: LEVEL_COLORS.low },
  { key: "veryLow", label: "منخفض جداً", color: LEVEL_COLORS.veryLow },
];

const CASE_TYPES = ["نزاهة", "جزائية", "مدنية"];
const CASE_STATUSES = ["قيد التحقيق", "محسومة", "محالة", "موحدة", "قيد المرافعة", "دعوى لم تقام", "قيد المعالجة", "جديدة", "منجزة"];

type HeatmapMode = "relative" | "absolute" | "completion";
type ViewMode = "map" | "list";
type SheetSnap = "hidden" | "peek" | "half" | "full";

type ProvinceStat = {
  total: number;
  new: number;
  processing: number;
  completed: number;
  cityStats: Record<string, number>;
  layers: { cases: number; investigation: number; correspondence: number; appointments: number };
  previousTotal?: number;
};

function geoToSvg(lat: number, lng: number) {
  const IRAQ_LAT_MIN = 29.06, IRAQ_LAT_MAX = 37.38;
  const IRAQ_LNG_MIN = 38.79, IRAQ_LNG_MAX = 48.57;
  return {
    x: ((lng - IRAQ_LNG_MIN) / (IRAQ_LNG_MAX - IRAQ_LNG_MIN)) * 1000,
    y: (1 - (lat - IRAQ_LAT_MIN) / (IRAQ_LAT_MAX - IRAQ_LAT_MIN)) * 1000,
  };
}

function getLevel(count: number, max: number) {
  if (max === 0) return "veryLow";
  const ratio = count / max;
  if (ratio > 0.8) return "veryHigh";
  if (ratio > 0.6) return "high";
  if (ratio > 0.4) return "medium";
  if (ratio > 0.2) return "low";
  return "veryLow";
}

function metricValue(stats: ProvinceStat | undefined, mode: HeatmapMode): number {
  if (!stats) return 0;
  if (mode === "completion") return stats.total > 0 ? stats.completed / stats.total : 0;
  return stats.total;
}

export default function DashboardMap() {
  const [, navigate] = useLocation();
  const isMobile = useIsMobile();
  const svgRef = useRef<SVGSVGElement>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);

  const [viewMode, setViewMode] = useState<ViewMode>("map");
  const [timeFilter, setTimeFilter] = useState("30d");
  const [compareMode, setCompareMode] = useState(false);
  const [heatmapMode, setHeatmapMode] = useState<HeatmapMode>("relative");
  const [selectedProvince, setSelectedProvince] = useState<string | null>(null);
  const [hoveredProvince, setHoveredProvince] = useState<string | null>(null);
  const [focusedProvinceIdx, setFocusedProvinceIdx] = useState(0);
  const [showStats, setShowStats] = useState(false);
  const [showFilter, setShowFilter] = useState(false);
  const [showLayers, setShowLayers] = useState(false);
  const [hoveredBranch, setHoveredBranch] = useState<number | null>(null);
  const [selectedBranch, setSelectedBranch] = useState<{ name: string; governorate: string } | null>(null);
  const [filterType, setFilterType] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [filterBranch, setFilterBranch] = useState("");
  const [layerCases, setLayerCases] = useState(true);
  const [layerBranches, setLayerBranches] = useState(true);
  const [layerCities, setLayerCities] = useState(true);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [sheetSnap, setSheetSnap] = useState<SheetSnap>("peek");
  const [userLocation, setUserLocation] = useState<{ x: number; y: number } | null>(null);

  const queryInput = useMemo(() => ({
    timeFilter,
    compare: compareMode,
    caseType: filterType || undefined,
    caseStatus: filterStatus || undefined,
    branch: filterBranch || undefined,
  }), [timeFilter, compareMode, filterType, filterStatus, filterBranch]);

  const { data: mapData, isLoading, isError } = trpc.casesMap.stats.useQuery(queryInput, {
    staleTime: 5 * 60 * 1000,
  });

  const { data: branchData } = trpc.casesMap.branchStats.useQuery(
    { branchName: selectedBranch?.name ?? "" },
    { enabled: !!selectedBranch?.name },
  );

  const provinceStats = useMemo(() => {
    const stats: Record<string, ProvinceStat> = {};
    for (const item of mapData?.provinces ?? []) {
      stats[item.province] = {
        total: item.total || 0,
        new: item.newCases || 0,
        processing: item.processing || 0,
        completed: item.completed || 0,
        cityStats: item.cityStats || {},
        layers: item.layers || { cases: 0, investigation: 0, correspondence: 0, appointments: 0 },
        previousTotal: item.previousTotal,
      };
    }
    return stats;
  }, [mapData]);

  const alertSet = useMemo(() => new Set(mapData?.alertProvinces ?? []), [mapData]);

  const displayMetric = useCallback((s?: ProvinceStat) => {
    if (!s) return 0;
    if (heatmapMode === "completion") return s.total > 0 ? Math.round((s.completed / s.total) * 100) : 0;
    return s.total;
  }, [heatmapMode]);

  const maxMetric = useMemo(() => {
    const vals = Object.values(provinceStats).map((s) => metricValue(s, heatmapMode));
    return Math.max(1, ...vals);
  }, [provinceStats, heatmapMode]);

  const totalCases = useMemo(
    () => Object.values(provinceStats).reduce((sum, s) => sum + s.total, 0),
    [provinceStats],
  );

  const topProvinces = useMemo(() =>
    Object.entries(provinceStats)
      .sort((a, b) => b[1].total - a[1].total)
      .slice(0, 3)
      .map(([name, stats]) => ({ name, ...stats })),
  [provinceStats]);

  const sortedList = useMemo(() =>
    Object.entries(provinceStats).sort((a, b) => b[1].total - a[1].total),
  [provinceStats]);

  const selectedData = selectedProvince ? provinceStats[selectedProvince] : null;
  const hoveredData = hoveredProvince ? provinceStats[hoveredProvince] : null;

  const selectedProvData = useMemo(
    () => IRAQ_PROVINCE_PATHS.find((p) => p.name === selectedProvince),
    [selectedProvince],
  );

  const focusBranches = useMemo(() => {
    if (!selectedProvince || !layerBranches) return [];
    return getSortedBranchesByGovernorate(selectedProvince);
  }, [selectedProvince, layerBranches]);

  const measurePathRef = useRef<SVGPathElement>(null);
  const [focusViewBox, setFocusViewBox] = useState("0 0 1000 1000");

  useEffect(() => {
    if (!selectedProvData || !measurePathRef.current) return;
    const bbox = measurePathRef.current.getBBox();
    const pad = Math.max(bbox.width, bbox.height) * 0.25;
    setFocusViewBox(
      `${bbox.x - pad} ${bbox.y - pad} ${bbox.width + pad * 2} ${bbox.height + pad * 2}`,
    );
  }, [selectedProvData]);

  const selectProvince = useCallback((name: string) => {
    setSelectedProvince(name);
    setLayerBranches(true);
    setHoveredProvince(null);
    setSheetSnap(isMobile ? "half" : "peek");
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, [isMobile]);

  const exitProvinceFocus = useCallback(() => {
    setSelectedProvince(null);
    setSelectedBranch(null);
    setHoveredBranch(null);
    setSheetSnap("hidden");
  }, []);

  const renderBranchPin = (branch: typeof focusBranches[0], scale = 1) => {
    const { x, y } = geoToSvg(branch.lat, branch.lng);
    const isHovered = hoveredBranch === branch.id;
    const pinW = (isHovered ? 26 : 18) * scale;
    const pinH = (isHovered ? 34 : 24) * scale;
    const caseCount = mapData?.branchStatsById?.[branch.id]
      ?? getBranchCaseCount(branch, mapData?.branchStats ?? {});
    return (
      <g
        key={`marker-${branch.id}`}
        onMouseEnter={() => setHoveredBranch(branch.id)}
        onMouseLeave={() => setHoveredBranch(null)}
        onClick={(e) => {
          e.stopPropagation();
          setSelectedBranch({ name: branch.name, governorate: branch.governorate });
          setSheetSnap("half");
        }}
        className="cursor-pointer"
      >
        {isHovered && (
          <circle cx={x} cy={y - pinH * 0.35} r={pinW * 0.9} fill="none" stroke="#FFD700" strokeWidth="2" opacity="0.5" />
        )}
        <rect
          x={x - pinW / 2} y={y - pinH} width={pinW} height={pinH * 0.72}
          rx={pinW * 0.28} fill={isHovered ? "#FFD700" : "#1a5c1a"} stroke="#FFD700" strokeWidth={1.5}
        />
        <polygon
          points={`${x - pinW * 0.28},${y - pinH * 0.3} ${x + pinW * 0.28},${y - pinH * 0.3} ${x},${y}`}
          fill={isHovered ? "#FFD700" : "#1a5c1a"} stroke="#FFD700" strokeWidth={1.5}
        />
        <image
          href={APP_LOGO_URL} x={x - pinW * 0.38} y={y - pinH * 0.95}
          width={pinW * 0.76} height={pinW * 0.76} preserveAspectRatio="xMidYMid meet"
        />
        {caseCount > 0 && (
          <circle cx={x + pinW * 0.38} cy={y - pinH + 4} r={7 * scale} fill="#ef4444" stroke="white" strokeWidth="1" />
        )}
        {(isHovered) && (
          <g>
            <rect x={x + pinW * 0.5} y={y - pinH - 8} width={140 * scale} height={40 * scale} rx={6}
              fill="#0d2b0d" stroke="#FFD700" strokeWidth="1" opacity="0.96" />
            <text x={x + pinW * 0.5 + 70 * scale} y={y - pinH + 10 * scale} textAnchor="middle"
              fill="#FFD700" fontSize={10 * scale} fontWeight="bold">{getBranchDisplayLabel(branch)}</text>
            <text x={x + pinW * 0.5 + 70 * scale} y={y - pinH + 24 * scale} textAnchor="middle"
              fill="#86efac" fontSize={9 * scale}>{caseCount} قضية</text>
          </g>
        )}
      </g>
    );
  };

  const getProvinceColor = (name: string) => {
    const stats = provinceStats[name];
    const val = metricValue(stats, heatmapMode);
    if (heatmapMode === "absolute") {
      const level = getLevel(val, maxMetric);
      return LEVEL_COLORS[level as keyof typeof LEVEL_COLORS];
    }
    if (heatmapMode === "completion") {
      const pct = stats?.total ? stats.completed / stats.total : 0;
      if (pct >= 0.7) return LEVEL_COLORS.veryLow;
      if (pct >= 0.5) return LEVEL_COLORS.low;
      if (pct >= 0.3) return LEVEL_COLORS.medium;
      if (pct >= 0.15) return LEVEL_COLORS.high;
      return LEVEL_COLORS.veryHigh;
    }
    const level = getLevel(val, maxMetric);
    return LEVEL_COLORS[level as keyof typeof LEVEL_COLORS];
  };

  const goToCases = (province: string, branch?: string) => {
    const params = new URLSearchParams({ province });
    if (branch) params.set("branch", branch);
    navigate(`/cases?${params.toString()}`);
  };

  const resetView = () => { setZoom(1); setPan({ x: 0, y: 0 }); };

  const handleMyLocation = () => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition((pos) => {
      const pt = geoToSvg(pos.coords.latitude, pos.coords.longitude);
      setUserLocation(pt);
      setPan({ x: 500 - pt.x * zoom, y: 500 - pt.y * zoom });
    });
  };

  const exportPng = async () => {
    const svg = svgRef.current;
    if (!svg) return;
    const clone = svg.cloneNode(true) as SVGSVGElement;
    clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    const svgData = new XMLSerializer().serializeToString(clone);
    const canvas = document.createElement("canvas");
    canvas.width = 2000;
    canvas.height = 2000;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const img = new Image();
    img.onload = () => {
      ctx.fillStyle = "#071a07";
      ctx.fillRect(0, 0, 2000, 2000);
      ctx.drawImage(img, 0, 0, 2000, 2000);
      const a = document.createElement("a");
      a.download = `خريطة-القضايا-${new Date().toISOString().slice(0, 10)}.png`;
      a.href = canvas.toDataURL("image/png");
      a.click();
    };
    img.src = "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(svgData)));
  };

  const printMap = () => window.print();

  // Pan with pointer
  const dragRef = useRef<{ x: number; y: number; active: boolean }>({ x: 0, y: 0, active: false });
  const onPointerDown = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest("[data-province]")) return;
    dragRef.current = { x: e.clientX - pan.x, y: e.clientY - pan.y, active: true };
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragRef.current.active) return;
    setPan({ x: e.clientX - dragRef.current.x, y: e.clientY - dragRef.current.y });
  };
  const onPointerUp = () => { dragRef.current.active = false; };

  // Keyboard navigation
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
      if (e.key === "Escape") {
        if (selectedProvince) exitProvinceFocus();
        else {
          setShowFilter(false);
          setShowLayers(false);
          setShowStats(false);
          setSheetSnap("hidden");
        }
      }
      if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
        e.preventDefault();
        const dir = e.key === "ArrowRight" ? -1 : 1;
        const next = (focusedProvinceIdx + dir + IRAQ_PROVINCE_PATHS.length) % IRAQ_PROVINCE_PATHS.length;
        setFocusedProvinceIdx(next);
        setHoveredProvince(IRAQ_PROVINCE_PATHS[next].name);
      }
      if (e.key === "Enter" && hoveredProvince) {
        selectProvince(hoveredProvince);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [focusedProvinceIdx, hoveredProvince, selectedProvince, selectProvince, exitProvinceFocus]);

  const cycleSheet = () => {
    const order: SheetSnap[] = ["hidden", "peek", "half", "full"];
    const i = order.indexOf(sheetSnap);
    setSheetSnap(order[(i + 1) % order.length]);
  };

  const sheetHeightClass = {
    hidden: "max-h-0 opacity-0",
    peek: "max-h-[28%]",
    half: "max-h-[55%]",
    full: "max-h-[88%]",
  }[sheetSnap];

  const detailPanelHeightClass = isMobile
    ? sheetHeightClass
    : selectedProvince
      ? "max-h-[38%]"
      : "";

  const mapMinHeight = isMobile ? "min(520px, 75vh)" : 520;

  if (isLoading) {
    return (
      <div className="flex flex-col bg-gradient-to-b from-[#071a07] to-[#0f2e0f] rounded-xl items-center justify-center gap-3" dir="rtl" style={{ minHeight: mapMinHeight }}>
        <div className="w-10 h-10 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
        <p className="text-green-200 text-sm">جاري تحميل الخريطة...</p>
      </div>
    );
  }

  if (isError) {
    return <EmptyState icon={MapPin} title="تعذّر تحميل الخريطة" description="تحقق من الاتصال وحاول مجدداً" />;
  }

  return (
    <div className="flex flex-col bg-gradient-to-b from-[#071a07] to-[#0f2e0f] text-white overflow-hidden relative rounded-xl print:bg-white" dir="rtl" style={{ minHeight: mapMinHeight }}>
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between px-3 py-2 gap-2 bg-black/10 print:hidden">
        <div className="flex items-center gap-1.5 flex-wrap">
          <button onClick={() => setViewMode("map")} className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs border ${viewMode === "map" ? "bg-amber-600/30 border-amber-500" : "border-green-700/40"}`}>
            <MapIcon className="w-3.5 h-3.5" /> خريطة
          </button>
          <button onClick={() => setViewMode("list")} className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs border ${viewMode === "list" ? "bg-amber-600/30 border-amber-500" : "border-green-700/40"}`}>
            <List className="w-3.5 h-3.5" /> قائمة
          </button>
          <button onClick={() => setShowStats(!showStats)} className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs border border-green-700/40">
            <BarChart3 className="w-3.5 h-3.5 text-amber-400" /> إحصائيات
          </button>
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          <select value={heatmapMode} onChange={(e) => setHeatmapMode(e.target.value as HeatmapMode)} className="bg-green-900/50 border border-green-700/40 rounded-lg px-2 py-1.5 text-xs text-white">
            <option value="relative" className="bg-green-950">كثافة نسبية</option>
            <option value="absolute" className="bg-green-950">عدد مطلق</option>
            <option value="completion" className="bg-green-950">معدل الإنجاز</option>
          </select>
          <label className="flex items-center gap-1 text-xs bg-green-900/50 border border-green-700/40 rounded-lg px-2 py-1.5 cursor-pointer">
            <input type="checkbox" checked={compareMode} onChange={(e) => setCompareMode(e.target.checked)} className="accent-amber-500" />
            مقارنة
          </label>
          <div className="flex items-center gap-1 bg-green-900/50 border border-green-700/40 rounded-lg px-2 py-1.5">
            <Calendar className="w-3.5 h-3.5 text-amber-400" />
            <select value={timeFilter} onChange={(e) => setTimeFilter(e.target.value)} className="bg-transparent text-xs outline-none text-white">
              <option value="30d" className="bg-green-950">30 يوم</option>
              <option value="90d" className="bg-green-950">3 أشهر</option>
              <option value="365d" className="bg-green-950">سنة</option>
              <option value="all" className="bg-green-950">الكل</option>
            </select>
          </div>
          <button onClick={() => { setShowFilter(!showFilter); setShowLayers(false); }} className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs border ${showFilter ? "bg-amber-600/30 border-amber-500" : "border-green-700/40"}`}>
            <Filter className="w-3.5 h-3.5 text-amber-400" /> فلتر
          </button>
          <button onClick={exportPng} className="p-1.5 rounded-lg border border-green-700/40" title="تصدير PNG"><Download className="w-3.5 h-3.5" /></button>
          <button onClick={printMap} className="p-1.5 rounded-lg border border-green-700/40" title="طباعة"><Printer className="w-3.5 h-3.5" /></button>
        </div>
      </div>

      {/* Filter panel */}
      {showFilter && (
        <div className="mx-3 mb-2 p-3 bg-black/40 border border-green-800/40 rounded-xl grid grid-cols-1 sm:grid-cols-3 gap-2 print:hidden">
          <select value={filterType} onChange={(e) => setFilterType(e.target.value)} className="bg-green-950 border border-green-700/40 rounded-lg px-2 py-1.5 text-xs">
            <option value="">كل الأنواع</option>
            {CASE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="bg-green-950 border border-green-700/40 rounded-lg px-2 py-1.5 text-xs">
            <option value="">كل الحالات</option>
            {CASE_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <input value={filterBranch} onChange={(e) => setFilterBranch(e.target.value)} placeholder="اسم الفرع..." className="bg-green-950 border border-green-700/40 rounded-lg px-2 py-1.5 text-xs" />
        </div>
      )}

      {totalCases === 0 && (
        <div className="mx-3 mb-2 p-3 bg-amber-900/20 border border-amber-700/30 rounded-xl text-center text-sm text-amber-200 print:hidden">
          لا توجد قضايا في الفترة المحددة — جرّب توسيع الفلتر الزمني
        </div>
      )}

      {/* List view */}
      {viewMode === "list" && (
        <div className="flex-1 overflow-y-auto p-3 space-y-1.5 print:hidden">
          {sortedList.length === 0 ? (
            <EmptyState icon={List} title="لا بيانات" description="لا توجد محافظات بقضايا في هذه الفترة" />
          ) : sortedList.map(([name, stats], i) => (
            <button key={name} onClick={() => { selectProvince(name); setViewMode("map"); }}
              className="w-full flex items-center justify-between bg-green-900/30 hover:bg-green-800/40 border border-green-800/30 rounded-xl px-3 py-2.5 text-sm">
              <div className="flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-amber-500/20 text-amber-400 text-xs flex items-center justify-center font-bold">{i + 1}</span>
                <span>{name}</span>
                {alertSet.has(name) && <AlertTriangle className="w-3.5 h-3.5 text-red-400" />}
              </div>
              <div className="flex items-center gap-3 text-xs">
                {compareMode && stats.previousTotal !== undefined && (
                  <span className={stats.total >= stats.previousTotal ? "text-green-400" : "text-red-400"}>
                    {stats.total >= stats.previousTotal ? <TrendingUp className="w-3.5 h-3.5 inline" /> : <TrendingDown className="w-3.5 h-3.5 inline" />}
                    {Math.abs(stats.total - stats.previousTotal)}
                  </span>
                )}
                <span className="font-bold text-amber-400">{stats.total}</span>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Map view */}
      {viewMode === "map" && (
        <div ref={mapContainerRef} className="flex-1 relative overflow-hidden min-h-[460px] touch-none">
          {/* قياس حدود المحافظة للتكبير */}
          <svg className="absolute w-0 h-0 overflow-hidden" aria-hidden>
            {selectedProvData && (
              <path ref={measurePathRef} d={selectedProvData.d} />
            )}
          </svg>

          {selectedProvince && selectedProvData ? (
            /* ===== وضع التركيز على محافظة ===== */
            <div className="absolute inset-0 flex flex-col animate-in fade-in duration-300">
              {/* شريط المحافظة */}
              <div className="absolute top-3 right-3 left-3 z-30 flex items-center justify-between gap-2 print:hidden">
                <div className="flex items-center gap-2 bg-black/60 backdrop-blur-md border border-amber-600/40 rounded-xl px-3 py-2">
                  <MapPin className="w-4 h-4 text-amber-400 shrink-0" />
                  <div>
                    <div className="font-bold text-amber-400 text-sm">{selectedProvince}</div>
                    <div className="text-[10px] text-green-300">
                      {focusBranches.length} فرع · {selectedData?.total ?? 0} قضية
                    </div>
                  </div>
                </div>
                <button
                  onClick={exitProvinceFocus}
                  className="flex items-center gap-1.5 bg-amber-600 hover:bg-amber-500 text-white text-xs font-semibold px-3 py-2 rounded-xl shadow-lg transition"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  الخريطة الكاملة
                </button>
              </div>

              {/* المحافظة المكبّرة */}
              <svg
                viewBox={focusViewBox}
                className="flex-1 w-full min-h-[420px] transition-all duration-500 ease-out"
                preserveAspectRatio="xMidYMid meet"
                style={{ maxHeight: "calc(100vh - 180px)" }}
              >
                <defs>
                  <filter id="provinceGlow" x="-20%" y="-20%" width="140%" height="140%">
                    <feDropShadow dx="0" dy="0" stdDeviation="8" floodColor="#fbbf24" floodOpacity="0.35" />
                  </filter>
                </defs>
                <rect width="2000" height="2000" x="-500" y="-500" fill="#071a07" />
                <path
                  d={selectedProvData.d}
                  fill={layerCases ? getProvinceColor(selectedProvince) : "#1a5c1a"}
                  stroke="#fbbf24"
                  strokeWidth={4}
                  filter="url(#provinceGlow)"
                  className="transition-all duration-300"
                />
                <text
                  x={selectedProvData.labelX}
                  y={selectedProvData.labelY - 20}
                  textAnchor="middle"
                  fill="#fbbf24"
                  fontSize="22"
                  fontWeight="bold"
                  style={{ filter: "drop-shadow(0 2px 4px rgba(0,0,0,0.8))" }}
                >
                  {selectedProvince}
                </text>
                {selectedData && (
                  <text
                    x={selectedProvData.labelX}
                    y={selectedProvData.labelY + 8}
                    textAnchor="middle"
                    fill="white"
                    fontSize="14"
                  >
                    {selectedData.total} قضية
                  </text>
                )}
                {layerBranches && focusBranches.map((b) => renderBranchPin(b, 1.35))}
              </svg>

              {/* خريطة العراق المصغّرة */}
              <div className="absolute bottom-4 left-4 z-20 w-40 sm:w-48 print:hidden">
                <div className="bg-black/70 backdrop-blur-md border border-green-700/50 rounded-xl p-2 shadow-2xl">
                  <div className="text-[10px] text-green-300 mb-1 text-center">خريطة العراق</div>
                  <svg viewBox={MAP_VIEWBOX} className="w-full aspect-square opacity-80">
                    <rect width="1000" height="1000" fill="#071a07" rx="4" />
                    {IRAQ_PROVINCE_PATHS.map((prov) => {
                      const isActive = prov.name === selectedProvince;
                      return (
                        <path
                          key={`mini-${prov.id}`}
                          d={prov.d}
                          fill={isActive ? getProvinceColor(prov.name) : "#1a3d1a"}
                          stroke={isActive ? "#fbbf24" : "#2d5a2d"}
                          strokeWidth={isActive ? 2 : 0.5}
                          opacity={isActive ? 1 : 0.45}
                          className="cursor-pointer hover:opacity-80 transition-opacity"
                          onClick={() => selectProvince(prov.name)}
                        />
                      );
                    })}
                  </svg>
                  <p className="text-[9px] text-green-400/70 text-center mt-1">انقر محافظة للتبديل</p>
                </div>
              </div>

              {/* شارة الفروع */}
              <div className="absolute bottom-4 right-3 z-20 bg-black/60 backdrop-blur-md border border-amber-700/40 rounded-xl px-3 py-2 print:hidden">
                <div className="text-[10px] text-green-300">فروع {selectedProvince}</div>
                <div className="text-lg font-bold text-amber-400">{focusBranches.length}</div>
              </div>
            </div>
          ) : (
            /* ===== الخريطة الكاملة ===== */
            <div className="absolute inset-0"
              onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp}>
              <div className="absolute top-2 right-2 z-10 bg-black/50 backdrop-blur-sm rounded-xl p-2.5 border border-green-800/30 text-[10px] print:hidden">
                <div className="font-bold mb-1.5 text-amber-400">
                  {heatmapMode === "completion" ? "معدل الإنجاز" : "مستوى القضايا"}
                </div>
                {LEVEL_LABELS.map((l) => (
                  <div key={l.key} className="flex items-center gap-1.5 mb-0.5">
                    <div className="w-3.5 h-2.5 rounded-sm" style={{ backgroundColor: l.color }} />
                    <span className="text-green-100">{l.label}</span>
                  </div>
                ))}
              </div>

              <div className="absolute top-2 left-2 z-10 flex flex-col gap-1.5 print:hidden">
                <button onClick={handleMyLocation} className="bg-green-900/70 border border-green-700/40 rounded-xl p-2 hover:bg-green-800/60" title="موقعي">
                  <Navigation className="w-4 h-4 text-amber-400 mx-auto" />
                </button>
                <button onClick={() => { setShowLayers(!showLayers); setShowFilter(false); }} className={`bg-green-900/70 border rounded-xl p-2 ${showLayers ? "border-amber-500" : "border-green-700/40"}`} title="طبقات">
                  <Layers className="w-4 h-4 text-amber-400 mx-auto" />
                </button>
                <button onClick={() => setZoom((z) => Math.min(3, z + 0.2))} className="bg-green-900/70 border border-green-700/40 rounded-xl p-2"><ZoomIn className="w-4 h-4 text-amber-400 mx-auto" /></button>
                <button onClick={() => setZoom((z) => Math.max(0.5, z - 0.2))} className="bg-green-900/70 border border-green-700/40 rounded-xl p-2"><ZoomOut className="w-4 h-4 text-amber-400 mx-auto" /></button>
                <button onClick={resetView} className="bg-green-900/70 border border-green-700/40 rounded-xl p-2"><RotateCcw className="w-4 h-4 text-amber-400 mx-auto" /></button>
              </div>

              {showLayers && (
                <div className="absolute top-14 left-2 z-20 bg-black/80 border border-green-700/40 rounded-xl p-3 text-xs space-y-2 print:hidden">
                  <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={layerCases} onChange={(e) => setLayerCases(e.target.checked)} className="accent-amber-500" /> قضايا (تلوين)</label>
                  <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={layerBranches} onChange={(e) => setLayerBranches(e.target.checked)} className="accent-amber-500" /> فروع الرافدين ({TOTAL_BRANCH_COUNT})</label>
                  <p className="text-[10px] text-green-300/80 pr-1">انقر محافظة للتكبير وعرض فروعها</p>
                  <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={layerCities} onChange={(e) => setLayerCities(e.target.checked)} className="accent-amber-500" /> أسماء المدن</label>
                </div>
              )}

              {hoveredProvince && hoveredData && (
                <div className="absolute z-20 bg-[#0d2b0d] border border-amber-500/50 rounded-lg px-3 py-2 text-xs shadow-xl pointer-events-none"
                  style={{ top: 60, left: "50%", transform: "translateX(-50%)" }}>
                  <div className="font-bold text-amber-400">{hoveredProvince}</div>
                  <div className="text-green-200">{hoveredData.total} قضية — انقر للتكبير</div>
                </div>
              )}

              <div className="absolute bottom-4 right-2 z-10 bg-black/50 backdrop-blur-sm rounded-xl p-2.5 border border-amber-700/30 print:hidden">
                <div className="text-[10px] text-green-300">إجمالي القضايا</div>
                <div className="text-lg font-bold text-amber-400">{totalCases.toLocaleString()}</div>
              </div>

              <svg ref={svgRef} viewBox={MAP_VIEWBOX} className="w-full h-full" preserveAspectRatio="xMidYMid meet"
                style={{ maxHeight: "calc(100vh - 200px)", transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`, transformOrigin: "center center" }}>
                <rect width="1000" height="1000" fill="#071a07" />
                <g>
                  {IRAQ_PROVINCE_PATHS.map((prov, idx) => {
                    const isHovered = hoveredProvince === prov.name;
                    const isFocused = focusedProvinceIdx === idx;
                    const isTop = topProvinces.some((t) => t.name === prov.name);
                    const hasAlert = alertSet.has(prov.name);
                    return (
                      <g key={prov.id} data-province={prov.name}
                        onClick={() => selectProvince(prov.name)}
                        onMouseEnter={() => setHoveredProvince(prov.name)}
                        onMouseLeave={() => setHoveredProvince(null)}
                        onFocus={() => { setFocusedProvinceIdx(idx); setHoveredProvince(prov.name); }}
                        tabIndex={0}
                        role="button"
                        aria-label={`محافظة ${prov.name}`}
                        className="cursor-pointer outline-none">
                        <path d={prov.d} fill={layerCases ? getProvinceColor(prov.name) : "#1a3d1a"}
                          stroke={isFocused ? "#fbbf24" : isHovered ? "#86efac" : "#1a4d1a"}
                          strokeWidth={isFocused ? 2.5 : isHovered ? 1.5 : 0.8}
                          className="transition-all duration-150 hover:brightness-125" />
                        {hasAlert && (
                          <text x={prov.labelX + 18} y={prov.labelY - 14} fontSize="12" className="pointer-events-none">⚠️</text>
                        )}
                        {layerCities && !isTop && (
                          <text x={prov.labelX} y={prov.labelY} textAnchor="middle" dominantBaseline="middle"
                            fill="white" fontSize="10" fontWeight="600" className="pointer-events-none select-none"
                            style={{ filter: "drop-shadow(1px 1px 2px rgba(0,0,0,0.9))" }}>{prov.name}</text>
                        )}
                      </g>
                    );
                  })}
                </g>

                {layerCases && topProvinces.map((tp) => {
                  const prov = IRAQ_PROVINCE_PATHS.find((p) => p.name === tp.name);
                  if (!prov) return null;
                  return (
                    <g key={`circle-${tp.name}`} className="pointer-events-none">
                      <circle cx={prov.labelX} cy={prov.labelY} r="34" fill="none" stroke="#d4a017" strokeWidth="1.5" opacity="0.4" />
                      <circle cx={prov.labelX} cy={prov.labelY} r="28" fill="#0d2b0d" stroke="#d4a017" strokeWidth="2" />
                      <text x={prov.labelX} y={prov.labelY - 5} textAnchor="middle" fill="#fbbf24" fontSize="13" fontWeight="bold">
                        {heatmapMode === "completion" ? `${displayMetric(tp)}%` : tp.total.toLocaleString()}
                      </text>
                      <text x={prov.labelX} y={prov.labelY + 10} textAnchor="middle" fill="white" fontSize="9">{tp.name}</text>
                    </g>
                  );
                })}

                {userLocation && (
                  <circle cx={userLocation.x} cy={userLocation.y} r="8" fill="#3b82f6" stroke="white" strokeWidth="2" />
                )}
              </svg>
            </div>
          )}
        </div>
      )}

      {/* Province detail panel — bottom sheet on mobile */}
      {selectedProvince && selectedData && (
        <div className={`absolute bottom-0 left-0 right-0 bg-white text-gray-900 rounded-t-3xl shadow-2xl z-20 transition-all duration-300 overflow-hidden flex flex-col print:hidden ${detailPanelHeightClass}`}>
          {isMobile && (
            <button onClick={cycleSheet} className="w-full flex justify-center py-2">
              <div className="w-12 h-1 bg-gray-300 rounded-full" />
            </button>
          )}
          <div className="overflow-y-auto p-4 sm:p-5 flex-1">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 bg-amber-100 rounded-full flex items-center justify-center">
                  <MapPin className="w-4 h-4 text-amber-600" />
                </div>
                <div>
                  <div className="font-bold text-lg">{selectedProvince}</div>
                  <div className="text-xs text-gray-500">تفاصيل المحافظة</div>
                </div>
              </div>
              <div className="flex items-center gap-1">
                {isMobile && (
                  <>
                    <button onClick={() => setSheetSnap(sheetSnap === "full" ? "half" : "full")} className="p-1.5 rounded-full hover:bg-gray-100">
                      {sheetSnap === "full" ? <ChevronDown className="w-5 h-5" /> : <ChevronUp className="w-5 h-5" />}
                    </button>
                  </>
                )}
                <button onClick={exitProvinceFocus} className="p-1.5 rounded-full hover:bg-gray-100">
                  <X className="w-5 h-5 text-gray-500" />
                </button>
              </div>
            </div>

            {alertSet.has(selectedProvince) && (
              <div className="mb-3 p-2.5 bg-red-50 border border-red-200 rounded-xl flex items-center gap-2 text-sm text-red-700">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                أكثر من {MAP_ALERT_PROCESSING_THRESHOLD} قضية قيد المعالجة
              </div>
            )}

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
              <div className="text-center p-2.5 bg-blue-50 rounded-xl border border-blue-100">
                <div className="text-lg font-bold text-blue-700">{selectedData.new}</div>
                <div className="text-[10px] text-gray-500">جديدة</div>
              </div>
              <div className="text-center p-2.5 bg-amber-50 rounded-xl border border-amber-200">
                <div className="text-lg font-bold text-amber-700">{selectedData.total}</div>
                <div className="text-[10px] text-gray-500">الإجمالي</div>
              </div>
              <div className="text-center p-2.5 bg-orange-50 rounded-xl border border-orange-100">
                <div className="text-lg font-bold text-orange-700">{selectedData.processing}</div>
                <div className="text-[10px] text-gray-500">قيد المعالجة</div>
              </div>
              <div className="text-center p-2.5 bg-green-50 rounded-xl border border-green-100">
                <div className="text-lg font-bold text-green-700">{selectedData.completed}</div>
                <div className="text-[10px] text-gray-500">منجزة</div>
              </div>
            </div>

            {compareMode && selectedData.previousTotal !== undefined && (
              <div className="mb-3 p-2.5 bg-gray-50 rounded-xl flex items-center justify-between text-sm">
                <span>مقارنة بالفترة السابقة</span>
                <span className={`font-bold flex items-center gap-1 ${selectedData.total >= selectedData.previousTotal ? "text-green-600" : "text-red-600"}`}>
                  {selectedData.total >= selectedData.previousTotal ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
                  {selectedData.previousTotal} ← {selectedData.total}
                  ({selectedData.total - selectedData.previousTotal >= 0 ? "+" : ""}{selectedData.total - selectedData.previousTotal})
                </span>
              </div>
            )}

            {/* Multi-layer stats */}
            <div className="grid grid-cols-4 gap-1.5 mb-3 text-center text-[10px]">
              <div className="bg-gray-50 rounded-lg p-2 border"><div className="font-bold">{selectedData.layers.cases}</div>قضايا</div>
              <div className="bg-gray-50 rounded-lg p-2 border"><div className="font-bold">{selectedData.layers.investigation}</div>تحقيقية</div>
              <div className="bg-gray-50 rounded-lg p-2 border"><div className="font-bold">{selectedData.layers.correspondence}</div>مراسلات</div>
              <div className="bg-gray-50 rounded-lg p-2 border"><div className="font-bold">{selectedData.layers.appointments}</div>مواعيد</div>
            </div>

            {/* City stats */}
            {Object.keys(selectedData.cityStats).length > 0 && (
              <div className="mb-3">
                <div className="text-xs font-semibold text-gray-700 mb-1.5">أعلى المدن</div>
                <div className="flex flex-wrap gap-1.5">
                  {Object.entries(selectedData.cityStats).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([city, cnt]) => (
                    <span key={city} className="text-[10px] bg-green-50 border border-green-100 rounded-full px-2 py-0.5">{city}: {cnt}</span>
                  ))}
                </div>
              </div>
            )}

            <button onClick={() => goToCases(selectedProvince)} className="w-full mb-3 py-2.5 bg-green-700 hover:bg-green-800 text-white rounded-xl text-sm font-semibold">
              عرض القضايا في {selectedProvince}
            </button>

            {/* Branches */}
            {(() => {
              const branches = getSortedBranchesByGovernorate(selectedProvince);
              if (branches.length === 0) return null;
              return (
                <div>
                  <div className="flex items-center gap-1.5 mb-2">
                    <Building2 className="w-3.5 h-3.5 text-amber-600" />
                    <span className="text-xs font-semibold text-gray-700">
                      فروع مصرف الرافدين في {selectedProvince} ({branches.length})
                    </span>
                  </div>
                  <div className="space-y-1 max-h-40 overflow-y-auto">
                    {branches.map((branch) => {
                      const cnt = mapData?.branchStatsById?.[branch.id]
                        ?? getBranchCaseCount(branch, mapData?.branchStats ?? {});
                      return (
                        <button key={branch.id} onClick={() => { setSelectedBranch({ name: branch.name, governorate: branch.governorate }); goToCases(selectedProvince, branch.name); }}
                          className="w-full flex items-start gap-2 bg-amber-50 rounded-lg px-2.5 py-2 border border-amber-100 hover:bg-amber-100 text-right">
                          <MapPin className="w-3 h-3 text-amber-600 mt-0.5 shrink-0" />
                          <div className="min-w-0 flex-1">
                            <div className="text-xs font-semibold text-gray-800">{getBranchDisplayLabel(branch)}</div>
                            <div className="text-[10px] text-gray-500 truncate">{branch.address}</div>
                          </div>
                          <span className="text-[10px] text-amber-700 font-mono bg-amber-100 px-1.5 py-0.5 rounded shrink-0">{cnt} قضية</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })()}

            {selectedBranch && branchData && (
              <div className="mt-3 p-2.5 bg-blue-50 border border-blue-100 rounded-xl text-xs">
                <div className="font-semibold">{selectedBranch.name}</div>
                <div>{branchData.cases} قضية — {branchData.processing} قيد المعالجة</div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Stats overlay */}
      {showStats && (
        <div className="absolute inset-0 bg-black/70 z-30 flex items-center justify-center p-4 print:hidden" onClick={() => setShowStats(false)}>
          <div className="bg-white text-gray-900 rounded-2xl p-5 max-w-md w-full max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-3">
              <h2 className="font-bold">إحصائيات القضايا</h2>
              <button onClick={() => setShowStats(false)} className="p-1 rounded-full hover:bg-gray-100"><X className="w-5 h-5" /></button>
            </div>
            <div className="grid grid-cols-2 gap-2 mb-3">
              <div className="bg-green-50 p-3 rounded-xl text-center border"><div className="text-xl font-bold text-green-700">{totalCases}</div><div className="text-xs">إجمالي</div></div>
              <div className="bg-blue-50 p-3 rounded-xl text-center border"><div className="text-xl font-bold text-blue-700">{Object.keys(provinceStats).length}</div><div className="text-xs">محافظة نشطة</div></div>
            </div>
            {alertSet.size > 0 && (
              <div className="mb-3 p-2 bg-red-50 border border-red-100 rounded-xl text-xs text-red-700">
                <AlertTriangle className="w-3.5 h-3.5 inline ml-1" />
                {alertSet.size} محافظة تجاوزت حد التنبيه ({MAP_ALERT_PROCESSING_THRESHOLD} قيد المعالجة)
              </div>
            )}
            <h3 className="font-semibold text-sm mb-2">ترتيب المحافظات</h3>
            <div className="space-y-1">
              {sortedList.map(([name, stats], i) => (
                <div key={name} className="flex items-center justify-between text-sm bg-gray-50 p-2 rounded-lg">
                  <div className="flex items-center gap-2">
                    <span className="w-5 h-5 bg-green-100 text-green-700 rounded-full text-xs flex items-center justify-center font-bold">{i + 1}</span>
                    <span>{name}</span>
                  </div>
                  <span className="font-bold text-green-700">{stats.total}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
