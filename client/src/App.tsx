import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import CasesRegistry from "./pages/CasesRegistry";
import CompensationCases from "./pages/CompensationCases";
import PersonalGuarantees from "./pages/PersonalGuarantees";
import InvestigationCases from "./pages/InvestigationCases";
import BankProperties from "./pages/BankProperties";
import MortgagedProperties from "./pages/MortgagedProperties";
import ForgedChecks from "./pages/ForgedChecks";
import GeneralFiles from "./pages/GeneralFiles";
import PendingApprovals from "./pages/PendingApprovals";
import Notifications from "./pages/Notifications";
import UserManagement from "./pages/UserManagement";
import ChangePassword from "./pages/ChangePassword";
import CaseDetail from "./pages/CaseDetail";
import AuditLog from "./pages/AuditLog";
import ManageSections from "./pages/ManageSections";
import CustomSection from "./pages/CustomSection";
import AdminCMS from "./pages/AdminCMS";
import Correspondence from "./pages/Correspondence";
import Appointments from "./pages/Appointments";
import LegalReviews from "./pages/LegalReviews";
import CasesMap from "./pages/CasesMap";
import QuarterlyStatus from "./pages/QuarterlyStatus";
import AppLayout from "./components/AppLayout";
import NotFound from "./pages/NotFound";
import { PageActionsProvider } from "./contexts/PageActionsContext";

function Router() {
  return (
    <Switch>
      <Route path="/login" component={Login} />
      <Route path="/">
        <AppLayout><Dashboard /></AppLayout>
      </Route>
      <Route path="/cases">
        <AppLayout><CasesRegistry /></AppLayout>
      </Route>
      <Route path="/cases/:id">
        {(params) => <AppLayout><CaseDetail id={Number(params.id)} /></AppLayout>}
      </Route>
      <Route path="/compensation">
        <AppLayout><CompensationCases /></AppLayout>
      </Route>
      <Route path="/guarantees">
        <AppLayout><PersonalGuarantees /></AppLayout>
      </Route>
      <Route path="/investigation">
        <AppLayout><InvestigationCases /></AppLayout>
      </Route>
      <Route path="/bank-properties">
        <AppLayout><BankProperties /></AppLayout>
      </Route>
      <Route path="/mortgaged-properties">
        <AppLayout><MortgagedProperties /></AppLayout>
      </Route>
      <Route path="/forged-checks">
        <AppLayout><ForgedChecks /></AppLayout>
      </Route>
      <Route path="/general-files">
        <AppLayout><GeneralFiles /></AppLayout>
      </Route>
      <Route path="/pending">
        <AppLayout><PendingApprovals /></AppLayout>
      </Route>
      <Route path="/notifications">
        <AppLayout><Notifications /></AppLayout>
      </Route>
      <Route path="/users">
        <AppLayout><UserManagement /></AppLayout>
      </Route>
      <Route path="/change-password">
        <AppLayout><ChangePassword /></AppLayout>
      </Route>
      <Route path="/audit-log">
        <AppLayout><AuditLog /></AppLayout>
      </Route>
      <Route path="/manage-sections">
        <AppLayout><ManageSections /></AppLayout>
      </Route>
      <Route path="/admin-cms">
        <AppLayout><AdminCMS /></AppLayout>
      </Route>
      <Route path="/correspondence">
        <AppLayout><Correspondence /></AppLayout>
      </Route>
      <Route path="/appointments">
        <AppLayout><Appointments /></AppLayout>
      </Route>
      <Route path="/legal-reviews">
        <AppLayout><LegalReviews /></AppLayout>
      </Route>
      <Route path="/cases-map">
        <AppLayout><CasesMap /></AppLayout>
      </Route>
      <Route path="/quarterly-status">
        <AppLayout><QuarterlyStatus /></AppLayout>
      </Route>
      <Route path="/custom/:slug">
        {(params) => <AppLayout><CustomSection slug={params.slug} /></AppLayout>}
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
