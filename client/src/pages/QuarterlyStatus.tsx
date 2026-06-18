import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Printer, Filter } from "lucide-react";
import { escapeHtml } from "../../../shared/caseUtils";

const PAGE_SIZE = 50;

export default function QuarterlyStatus() {
  const [selectedStatus, setSelectedStatus] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [reportType, setReportType] = useState<"monthly" | "quarterly" | "annual">("monthly");
  const [reportYear, setReportYear] = useState(new Date().getFullYear());
  const [reportMonth, setReportMonth] = useState(new Date().getMonth() + 1);
  const [reportQuarter, setReportQuarter] = useState(1);
  const [reportStatusFilter, setReportStatusFilter] = useState<string>("");

  const {
    data: stats = {},
    isLoading: statsLoading,
    isError: statsError,
    refetch: refetchStats,
  } = trpc.quarterlyStatus.integrityStats.useQuery();

  const {
    data: casesResult,
    isLoading: casesLoading,
    isError: casesError,
    refetch: refetchCases,
  } = trpc.quarterlyStatus.integrityCases.useQuery({
    statusFilter: selectedStatus || undefined,
    page,
    pageSize: PAGE_SIZE,
  });

  const cases = casesResult?.items ?? [];
  const totalCases = casesResult?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCases / PAGE_SIZE));

  const {
    data: report,
    isLoading: reportLoading,
    isError: reportError,
    refetch: refetchReport,
  } = trpc.quarterlyStatus.periodicReport.useQuery({
    periodType: reportType,
    year: reportYear,
    month: reportType === "monthly" ? reportMonth : undefined,
    quarter: reportType === "quarterly" ? reportQuarter : undefined,
    statusFilter: reportStatusFilter || undefined,
  });

  useEffect(() => { setPage(1); }, [selectedStatus]);

  const statusColors: Record<string, string> = {
    "محالة": "bg-blue-100 text-blue-800",
    "محسومة": "bg-green-100 text-green-800",
    "قيد التحقيق": "bg-yellow-100 text-yellow-800",
    "قيد المرافعة": "bg-orange-100 text-orange-800",
    "مرفوضة": "bg-red-100 text-red-800",
    "موحدة": "bg-purple-100 text-purple-800",
  };

  const statusCardColors: Record<string, string> = {
    "محالة": "border-blue-300 bg-blue-50",
    "محسومة": "border-green-300 bg-green-50",
    "قيد التحقيق": "border-yellow-300 bg-yellow-50",
    "موحدة": "border-purple-300 bg-purple-50",
    "قيد المرافعة": "border-orange-300 bg-orange-50",
    "مرفوضة": "border-red-300 bg-red-50",
  };

  const statusTextColors: Record<string, string> = {
    "محالة": "text-blue-700",
    "محسومة": "text-green-700",
    "قيد التحقيق": "text-yellow-700",
    "موحدة": "text-purple-700",
    "قيد المرافعة": "text-orange-700",
    "مرفوضة": "text-red-700",
  };

  const statusCounts = Object.entries(stats as Record<string, number>).map(([status, count]) => ({
    status,
    count: count as number,
  }));

  const allStatuses = ["قيد التحقيق", "محالة", "محسومة", "موحدة", "قيد المرافعة", "مرفوضة"];

  const handlePrint = () => {
    const printWindow = window.open("", "_blank");
    if (!printWindow) return;

    const reportTitle = {
      monthly: `تقرير شهري - ${reportMonth}/${reportYear}`,
      quarterly: `تقرير فصلي - الربع ${reportQuarter}/${reportYear}`,
      annual: `تقرير سنوي - ${reportYear}`,
    }[reportType];

    const filterNote = reportStatusFilter ? ` (مصفى: ${escapeHtml(reportStatusFilter)})` : "";

    const byCaseStatus = (report as any)?.byCaseStatus || {};
    const statusRows = allStatuses
      .filter(s => byCaseStatus[s] !== undefined)
      .map(s => `<tr><td>${escapeHtml(s)}</td><td>${escapeHtml(byCaseStatus[s])}</td></tr>`)
      .join("");

    const detailRows = ((report as any)?.details || []).map((d: any) =>
      `<tr>
        <td>${escapeHtml(d.caseNumber || "")}</td>
        <td>${escapeHtml(d.subject || "")}</td>
        <td>${escapeHtml(d.status || "")}</td>
        <td>${d.createdAt ? escapeHtml(new Date(d.createdAt).toLocaleDateString("ar-EG")) : ""}</td>
      </tr>`
    ).join("");

    const safeTitle = escapeHtml(reportTitle);

    const html = `
      <!DOCTYPE html>
      <html dir="rtl">
      <head>
        <meta charset="UTF-8">
        <title>${safeTitle}${filterNote}</title>
        <style>
          body { font-family: Arial, sans-serif; margin: 40px; background: white; }
          .header { text-align: center; margin-bottom: 30px; border-bottom: 2px solid #1a472a; padding-bottom: 20px; }
          .logo { font-size: 24px; font-weight: bold; color: #1a472a; }
          .subtitle { color: #d4af37; font-size: 14px; }
          .watermark { position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%) rotate(-45deg); font-size: 80px; color: rgba(212, 175, 55, 0.1); z-index: -1; }
          table { width: 100%; border-collapse: collapse; margin-top: 20px; }
          th, td { border: 1px solid #ddd; padding: 12px; text-align: right; }
          th { background-color: #1a472a; color: #d4af37; font-weight: bold; }
          tr:nth-child(even) { background-color: #f9f9f9; }
          .section-title { font-size: 16px; font-weight: bold; color: #1a472a; margin-top: 30px; margin-bottom: 10px; }
          .summary { margin-top: 20px; padding: 15px; background-color: #f0f0f0; border-radius: 5px; }
          .summary-item { display: inline-block; margin-left: 30px; margin-bottom: 10px; }
          .summary-label { font-weight: bold; color: #1a472a; }
          .summary-value { font-size: 18px; color: #d4af37; font-weight: bold; margin-right: 8px; }
        </style>
      </head>
      <body>
        <div class="watermark">مصرف الرافدين</div>
        <div class="header">
          <div class="logo">🏛️ مصرف الرافدين</div>
          <div class="subtitle">مكتب مندوب الأنبار / الوحدة القانونية</div>
          <div style="margin-top: 10px; font-size: 16px; font-weight: bold;">${safeTitle}${filterNote}</div>
        </div>

        <div class="section-title">ملخص الإحصائيات</div>
        <table>
          <thead>
            <tr>
              <th>البيان</th>
              <th>العدد</th>
            </tr>
          </thead>
          <tbody>
            <tr><td>إجمالي القضايا في الفترة</td><td>${(report as any)?.added || 0}</td></tr>
            <tr><td>قيد التحقيق</td><td>${(report as any)?.underInvestigation || 0}</td></tr>
            <tr><td>محالة</td><td>${(report as any)?.forwarded || 0}</td></tr>
            <tr><td>محسومة</td><td>${(report as any)?.resolved || 0}</td></tr>
            <tr><td>موحدة</td><td>${(report as any)?.unified || 0}</td></tr>
            ${statusRows}
          </tbody>
        </table>

        <div class="summary">
          <div class="summary-item">
            <span class="summary-label">معدل الإنجاز:</span>
            <span class="summary-value">${(report as any)?.added ? Math.round((((report as any)?.resolved || 0) / ((report as any)?.added || 1)) * 100) : 0}%</span>
          </div>
          <div class="summary-item">
            <span class="summary-label">تاريخ الإنشاء:</span>
            <span class="summary-value">${new Date().toLocaleDateString("ar-EG")}</span>
          </div>
        </div>

        ${detailRows ? `
        <div class="section-title">تفاصيل القضايا</div>
        <table>
          <thead>
            <tr>
              <th>رقم القضية</th>
              <th>الموضوع</th>
              <th>الحالة</th>
              <th>تاريخ الإضافة</th>
            </tr>
          </thead>
          <tbody>${detailRows}</tbody>
        </table>` : ""}

        <div style="margin-top: 50px; text-align: center; color: #999; font-size: 12px;">
          تم إنشاء هذا التقرير بتاريخ ${new Date().toLocaleDateString("ar-EG")}
        </div>
      </body>
      </html>
    `;

    printWindow.document.write(html);
    printWindow.document.close();
    setTimeout(() => printWindow.print(), 250);
  };

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-3xl font-bold text-foreground">الموقف الفصلي</h1>
        <p className="text-muted-foreground">قضايا النزاهة والإحصائيات</p>
      </div>

      {statsError && (
        <Card className="p-4 border-red-200 bg-red-50 flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-red-700">تعذّر تحميل إحصائيات النزاهة.</p>
          <Button variant="outline" size="sm" onClick={() => refetchStats()}>إعادة المحاولة</Button>
        </Card>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {statsLoading ? (
          <div className="col-span-full text-center py-6 text-muted-foreground">جاري تحميل الإحصائيات...</div>
        ) : statusCounts.map(({ status, count }) => (
          <Card
            key={status}
            className={`p-4 cursor-pointer transition-all border-2 ${
              statusCardColors[status] || "bg-gray-50 border-gray-300"
            } ${selectedStatus === status ? "ring-2 ring-primary shadow-md scale-[1.02]" : ""}`}
            onClick={() => setSelectedStatus(selectedStatus === status ? null : status)}
          >
            <div className={`text-sm font-medium ${statusTextColors[status] || "text-gray-700"}`}>{status}</div>
            <div className={`text-2xl font-bold mt-2 ${statusTextColors[status] || "text-gray-700"}`}>{count}</div>
          </Card>
        ))}
      </div>

      <Card className="p-6">
        <div className="flex justify-between items-center mb-4">
          <div className="flex items-center gap-3">
            <h2 className="text-xl font-bold">قضايا النزاهة</h2>
            {selectedStatus && (
              <span className={`px-3 py-1 rounded-full text-xs font-medium ${statusColors[selectedStatus] || "bg-gray-100"}`}>
                <Filter className="w-3 h-3 inline ml-1" />
                {selectedStatus}
              </span>
            )}
          </div>
          <div className="flex gap-2">
            {selectedStatus && (
              <Button variant="outline" size="sm" onClick={() => setSelectedStatus(null)}>
                إلغاء الفلتر
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={() => window.print()}>
              <Printer className="w-4 h-4 ml-1" />
              طباعة
            </Button>
          </div>
        </div>

        {casesError ? (
          <div className="text-center py-8 text-red-600">
            فشل تحميل القضايا —{" "}
            <button type="button" className="underline" onClick={() => refetchCases()}>إعادة المحاولة</button>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/30">
                    <th className="text-right p-3 font-semibold">رقم القضية</th>
                    <th className="text-right p-3 font-semibold">الموضوع</th>
                    <th className="text-right p-3 font-semibold">الحالة</th>
                    <th className="text-right p-3 font-semibold">تاريخ الإضافة</th>
                  </tr>
                </thead>
                <tbody>
                  {casesLoading ? (
                    <tr><td colSpan={4} className="p-8 text-center text-muted-foreground">جاري التحميل...</td></tr>
                  ) : cases.map((c: any) => (
                    <tr key={c.id} className="border-b hover:bg-muted/50">
                      <td className="p-3 font-mono text-xs">{c.caseNumber}</td>
                      <td className="p-3 max-w-xs truncate">{c.subject}</td>
                      <td className="p-3">
                        <span className={`px-2 py-1 rounded text-xs font-medium ${statusColors[c.caseStatus] || "bg-gray-100 text-gray-700"}`}>
                          {c.caseStatus}
                        </span>
                      </td>
                      <td className="p-3 text-muted-foreground">{new Date(c.createdAt).toLocaleDateString("ar-EG")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {cases.length === 0 && !casesLoading && (
              <div className="text-center py-8 text-muted-foreground">
                {selectedStatus ? `لا توجد قضايا بحالة "${selectedStatus}"` : "لا توجد قضايا"}
              </div>
            )}

            {totalCases > 0 && (
              <div className="flex flex-wrap items-center justify-between gap-2 mt-4">
                <span className="text-sm text-muted-foreground">
                  {totalCases.toLocaleString()} قضية — صفحة {page} من {totalPages}
                </span>
                <div className="flex gap-1">
                  <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>السابق</Button>
                  <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>التالي</Button>
                </div>
              </div>
            )}
          </>
        )}
      </Card>

      <Card className="p-6">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold">التقارير الدورية</h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <div>
            <label className="block text-sm font-medium mb-2">نوع التقرير</label>
            <select
              value={reportType}
              onChange={(e) => setReportType(e.target.value as "monthly" | "quarterly" | "annual")}
              className="w-full px-3 py-2 border rounded-lg bg-background"
            >
              <option value="monthly">شهري</option>
              <option value="quarterly">فصلي</option>
              <option value="annual">سنوي</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">السنة</label>
            <input
              type="number"
              value={reportYear}
              onChange={(e) => setReportYear(parseInt(e.target.value))}
              className="w-full px-3 py-2 border rounded-lg bg-background"
              min="2015"
              max={new Date().getFullYear()}
            />
          </div>

          {reportType === "monthly" && (
            <div>
              <label className="block text-sm font-medium mb-2">الشهر</label>
              <select
                value={reportMonth}
                onChange={(e) => setReportMonth(parseInt(e.target.value))}
                className="w-full px-3 py-2 border rounded-lg bg-background"
              >
                {Array.from({ length: 12 }, (_, i) => (
                  <option key={i + 1} value={i + 1}>
                    {new Date(2024, i).toLocaleDateString("ar-EG", { month: "long" })}
                  </option>
                ))}
              </select>
            </div>
          )}

          {reportType === "quarterly" && (
            <div>
              <label className="block text-sm font-medium mb-2">الربع</label>
              <select
                value={reportQuarter}
                onChange={(e) => setReportQuarter(parseInt(e.target.value))}
                className="w-full px-3 py-2 border rounded-lg bg-background"
              >
                <option value={1}>الربع الأول (يناير - مارس)</option>
                <option value={2}>الربع الثاني (أبريل - يونيو)</option>
                <option value={3}>الربع الثالث (يوليو - سبتمبر)</option>
                <option value={4}>الربع الرابع (أكتوبر - ديسمبر)</option>
              </select>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium mb-2">
              <Filter className="w-3 h-3 inline ml-1" />
              فلترة بالحالة
            </label>
            <select
              value={reportStatusFilter}
              onChange={(e) => setReportStatusFilter(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg bg-background"
            >
              <option value="">جميع الحالات</option>
              <option value="قيد التحقيق">قيد التحقيق</option>
              <option value="محالة">محالة</option>
              <option value="محسومة">محسومة</option>
              <option value="موحدة">موحدة</option>
              <option value="قيد المرافعة">قيد المرافعة</option>
              <option value="مرفوضة">مرفوضة</option>
            </select>
          </div>
        </div>

        {reportError && (
          <div className="text-center py-6 text-red-600 mb-4">
            فشل تحميل التقرير —{" "}
            <button type="button" className="underline" onClick={() => refetchReport()}>إعادة المحاولة</button>
          </div>
        )}

        {reportLoading && (
          <div className="text-center py-6 text-muted-foreground">جاري تحميل التقرير...</div>
        )}

        {report && !reportLoading && !reportError && (
          <>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 mb-4">
              <Card className="p-3 text-center bg-blue-50 border-blue-200">
                <div className="text-xs text-muted-foreground mb-1">إجمالي الفترة</div>
                <div className="text-xl font-bold text-blue-700">{(report as any).added}</div>
              </Card>
              <Card className="p-3 text-center bg-yellow-50 border-yellow-200">
                <div className="text-xs text-muted-foreground mb-1">قيد التحقيق</div>
                <div className="text-xl font-bold text-yellow-700">{(report as any).underInvestigation || 0}</div>
              </Card>
              <Card className="p-3 text-center bg-orange-50 border-orange-200">
                <div className="text-xs text-muted-foreground mb-1">محالة</div>
                <div className="text-xl font-bold text-orange-700">{(report as any).forwarded}</div>
              </Card>
              <Card className="p-3 text-center bg-green-50 border-green-200">
                <div className="text-xs text-muted-foreground mb-1">محسومة</div>
                <div className="text-xl font-bold text-green-700">{(report as any).resolved}</div>
              </Card>
              <Card className="p-3 text-center bg-purple-50 border-purple-200">
                <div className="text-xs text-muted-foreground mb-1">موحدة</div>
                <div className="text-xl font-bold text-purple-700">{(report as any).unified || 0}</div>
              </Card>
            </div>

            {(report as any).details && (report as any).details.length > 0 && (
              <div className="mt-4">
                <h3 className="text-sm font-semibold mb-2 text-muted-foreground">
                  تفاصيل القضايا ({(report as any).details.length})
                  {reportStatusFilter && <span className="mr-2 text-primary">- {reportStatusFilter}</span>}
                </h3>
                <div className="overflow-x-auto max-h-64 overflow-y-auto border rounded-lg">
                  <table className="w-full text-xs">
                    <thead className="sticky top-0 bg-muted">
                      <tr>
                        <th className="text-right p-2 font-semibold">رقم القضية</th>
                        <th className="text-right p-2 font-semibold">الموضوع</th>
                        <th className="text-right p-2 font-semibold">الحالة</th>
                        <th className="text-right p-2 font-semibold">التاريخ</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(report as any).details.map((d: any, i: number) => (
                        <tr key={i} className="border-b hover:bg-muted/30">
                          <td className="p-2 font-mono">{d.caseNumber}</td>
                          <td className="p-2 max-w-xs truncate">{d.subject}</td>
                          <td className="p-2">
                            <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${statusColors[d.status] || "bg-gray-100 text-gray-700"}`}>
                              {d.status}
                            </span>
                          </td>
                          <td className="p-2 text-muted-foreground">
                            {d.createdAt ? new Date(d.createdAt).toLocaleDateString("ar-EG") : ""}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {(report as any).details && (report as any).details.length === 0 && (
              <div className="text-center py-6 text-muted-foreground text-sm">
                لا توجد قضايا في هذه الفترة{reportStatusFilter ? ` بحالة "${reportStatusFilter}"` : ""}
              </div>
            )}
          </>
        )}

        <Button onClick={handlePrint} className="mt-4 w-full" disabled={reportLoading || reportError}>
          <Printer className="w-4 h-4 ml-2" />
          طباعة التقرير
        </Button>
      </Card>
    </div>
  );
}
