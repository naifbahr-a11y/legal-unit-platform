import DashboardMap from "@/components/DashboardMap";

/** صفحة خريطة القضايا — تستخدم المكوّن الكامل مع كل عناصر التحكم */
export default function CasesMap() {
  return (
    <div className="h-full flex flex-col min-h-0" dir="rtl">
      <DashboardMap />
    </div>
  );
}
