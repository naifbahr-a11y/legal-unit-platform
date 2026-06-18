import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import type { BreadcrumbItem } from "@/lib/navigation";

type ConfirmOptions = {
  title?: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
};

type PageActions = {
  onAdd?: () => void;
  breadcrumbs?: BreadcrumbItem[];
};

type PageActionsContextValue = {
  confirm: (options: ConfirmOptions) => Promise<boolean>;
  registerPageActions: (actions: PageActions) => void;
  pageActions: PageActions;
};

const PageActionsContext = createContext<PageActionsContextValue | null>(null);

export function PageActionsProvider({ children }: { children: ReactNode }) {
  const [pageActions, setPageActions] = useState<PageActions>({});
  const [confirmState, setConfirmState] = useState<(ConfirmOptions & { resolve: (v: boolean) => void }) | null>(null);

  const confirm = useCallback((options: ConfirmOptions) => {
    return new Promise<boolean>((resolve) => {
      setConfirmState({ ...options, resolve });
    });
  }, []);

  const registerPageActions = useCallback((actions: PageActions) => {
    setPageActions(actions);
  }, []);

  return (
    <PageActionsContext.Provider value={{ confirm, registerPageActions, pageActions }}>
      {children}
      <AlertDialog open={!!confirmState} onOpenChange={(open) => { if (!open) confirmState?.resolve(false); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirmState?.title ?? "تأكيد"}</AlertDialogTitle>
            <AlertDialogDescription>{confirmState?.description}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2 sm:gap-0">
            <AlertDialogCancel onClick={() => { confirmState?.resolve(false); setConfirmState(null); }}>
              {confirmState?.cancelLabel ?? "إلغاء"}
            </AlertDialogCancel>
            <AlertDialogAction
              className={confirmState?.destructive ? "bg-destructive text-destructive-foreground hover:bg-destructive/90" : ""}
              onClick={() => { confirmState?.resolve(true); setConfirmState(null); }}
            >
              {confirmState?.confirmLabel ?? "تأكيد"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageActionsContext.Provider>
  );
}

export function usePageActions() {
  const ctx = useContext(PageActionsContext);
  if (!ctx) throw new Error("usePageActions must be used within PageActionsProvider");
  return ctx;
}

export function useRegisterPageActions(actions: PageActions) {
  const { registerPageActions } = usePageActions();
  const actionsRef = useRef(actions);
  actionsRef.current = actions;

  useEffect(() => {
    registerPageActions(actionsRef.current);
    return () => registerPageActions({});
  }, [registerPageActions]);
}
