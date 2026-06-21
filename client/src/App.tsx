import { lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import Login from "./pages/Login";
import AppLayout from "./components/AppLayout";
import NotFound from "./pages/NotFound";
import { PageActionsProvider } from "./contexts/PageActionsContext";

const Dashboard = lazy(() => import("./pages/Dashboard"));
const CasesRegistry = lazy(() => import("./pages/CasesRegistry"));
const CompensationCases = lazy(() => import("./pages/CompensationCases"));
const PersonalGuarantees = lazy(() => import("./pages/PersonalGuarantees"));
const InvestigationCases = lazy(() => import("./pages/InvestigationCases"));
const BankProperties = lazy(() => import("./pages/BankProperties"));
const MortgagedProperties = lazy(() => import("./pages/MortgagedProperties"));
const ForgedChecks = lazy(() => import("./pages/ForgedChecks"));
const GeneralFiles = lazy(() => import("./pages/GeneralFiles"));
const PendingApprovals = lazy(() => import("./pages/PendingApprovals"));
const Notifications = lazy(() => import("./pages/Notifications"));
const UserManagement = lazy(() => import("./pages/UserManagement"));
const ChangePassword = lazy(() => import("./pages/ChangePassword"));
const CaseDetail = lazy(() => import("./pages/CaseDetail"));
const AuditLog = lazy(() => import("./pages/AuditLog"));
const ManageSections = lazy(() => import("./pages/ManageSections"));
const CustomSection = lazy(() => import("./pages/CustomSection"));
const AdminCMS = lazy(() => import("./pages/AdminCMS"));
const Correspondence = lazy(() => import("./pages/Correspondence"));
const Appointments = lazy(() => import("./pages/Appointments"));
const LegalReviews = lazy(() => import("./pages/LegalReviews"));
const CasesMap = lazy(() => import("./pages/CasesMap"));
const QuarterlyStatus = lazy(() => import("./pages/QuarterlyStatus"));

function PageFallback() {
  return (
    <div className="min-h-[40vh] flex items-center justify-center">
      <p className="text-muted-foreground text-sm">جاري التحميل...</p>
    </div>
  );
}

function LazyPage({ children }: { children: React.ReactNode }) {
  return <Suspense fallback={<PageFallback />}>{children}</Suspense>;
}

function Router() {
  return (
    <Switch>
      <Route path="/login" component={Login} />
      <Route path="/">
        <AppLayout><LazyPage><Dashboard /></LazyPage></AppLayout>
      </Route>
      <Route path="/cases/:id">
        {(params) => (
          <AppLayout>
            <LazyPage><CaseDetail id={Number(params.id)} /></LazyPage>
          </AppLayout>
        )}
      </Route>
      <Route path="/cases">
        <AppLayout><LazyPage><CasesRegistry /></LazyPage></AppLayout>
      </Route>
      <Route path="/compensation">
        <AppLayout><LazyPage><CompensationCases /></LazyPage></AppLayout>
      </Route>
      <Route path="/guarantees">
        <AppLayout><LazyPage><PersonalGuarantees /></LazyPage></AppLayout>
      </Route>
      <Route path="/investigation">
        <AppLayout><LazyPage><InvestigationCases /></LazyPage></AppLayout>
      </Route>
      <Route path="/bank-properties">
        <AppLayout><LazyPage><BankProperties /></LazyPage></AppLayout>
      </Route>
      <Route path="/mortgaged-properties">
        <AppLayout><LazyPage><MortgagedProperties /></LazyPage></AppLayout>
      </Route>
      <Route path="/forged-checks">
        <AppLayout><LazyPage><ForgedChecks /></LazyPage></AppLayout>
      </Route>
      <Route path="/general-files">
        <AppLayout><LazyPage><GeneralFiles /></LazyPage></AppLayout>
      </Route>
      <Route path="/pending">
        <AppLayout><LazyPage><PendingApprovals /></LazyPage></AppLayout>
      </Route>
      <Route path="/notifications">
        <AppLayout><LazyPage><Notifications /></LazyPage></AppLayout>
      </Route>
      <Route path="/users">
        <AppLayout><LazyPage><UserManagement /></LazyPage></AppLayout>
      </Route>
      <Route path="/change-password">
        <AppLayout><LazyPage><ChangePassword /></LazyPage></AppLayout>
      </Route>
      <Route path="/audit-log">
        <AppLayout><LazyPage><AuditLog /></LazyPage></AppLayout>
      </Route>
      <Route path="/manage-sections">
        <AppLayout><LazyPage><ManageSections /></LazyPage></AppLayout>
      </Route>
      <Route path="/admin-cms">
        <AppLayout><LazyPage><AdminCMS /></LazyPage></AppLayout>
      </Route>
      <Route path="/correspondence">
        <AppLayout><LazyPage><Correspondence /></LazyPage></AppLayout>
      </Route>
      <Route path="/appointments">
        <AppLayout><LazyPage><Appointments /></LazyPage></AppLayout>
      </Route>
      <Route path="/legal-reviews">
        <AppLayout><LazyPage><LegalReviews /></LazyPage></AppLayout>
      </Route>
      <Route path="/cases-map">
        <AppLayout><LazyPage><CasesMap /></LazyPage></AppLayout>
      </Route>
      <Route path="/quarterly-status">
        <AppLayout><LazyPage><QuarterlyStatus /></LazyPage></AppLayout>
      </Route>
      <Route path="/custom/:slug">
        {(params) => (
          <AppLayout>
            <LazyPage><CustomSection slug={params.slug} /></LazyPage>
          </AppLayout>
        )}
      </Route>
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light">
        <TooltipProvider>
          <Toaster />
          <PageActionsProvider>
            <Router />
          </PageActionsProvider>
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
