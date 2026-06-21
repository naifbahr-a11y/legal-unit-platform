import { useState, useRef, type ReactNode } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ChevronDown, Edit, Eye, Trash2 } from "lucide-react";
import { EmptyState } from "@/components/EmptyState";
import { CardListSkeleton } from "@/components/ListSkeleton";

export type MobileCardField = {
  key: string;
  label: string;
  render?: (value: unknown, record: Record<string, unknown>) => ReactNode;
};

type MobileDataCardsProps = {
  records: Record<string, unknown>[];
  fields: MobileCardField[];
  titleKey?: string;
  subtitleKey?: string;
  getTitle?: (record: Record<string, unknown>) => ReactNode;
  getSubtitle?: (record: Record<string, unknown>) => ReactNode;
  isLoading?: boolean;
  emptyMessage?: string;
  emptyTitle?: string;
  emptyActionLabel?: string;
  onEmptyAction?: () => void;
  onEdit?: (record: Record<string, unknown>) => void;
  onDelete?: (record: Record<string, unknown>) => void;
  onView?: (record: Record<string, unknown>) => void;
  onClick?: (record: Record<string, unknown>) => void;
  renderActions?: (record: Record<string, unknown>) => ReactNode;
  renderStatusBadge?: (record: Record<string, unknown>) => ReactNode;
  getCardClassName?: (record: Record<string, unknown>) => string;
  selectedIds?: number[];
  onToggleSelect?: (id: number, checked: boolean) => void;
  headerExtra?: (record: Record<string, unknown>) => ReactNode;
  maxVisibleFields?: number;
};

function SwipeableCard({
  children,
  swipeActions,
}: {
  children: ReactNode;
  swipeActions?: ReactNode;
}) {
  const [offset, setOffset] = useState(0);
  const startX = useRef(0);
  const dragging = useRef(false);

  if (!swipeActions) return <>{children}</>;

  return (
    <div className="relative overflow-hidden rounded-xl">
      <div className="absolute inset-y-0 left-0 flex items-center gap-1 pl-2 bg-muted/80">
        {swipeActions}
      </div>
      <div
        className="relative transition-transform touch-pan-y"
        style={{ transform: `translateX(${offset}px)` }}
        onTouchStart={(e) => { startX.current = e.touches[0].clientX; dragging.current = true; }}
        onTouchMove={(e) => {
          if (!dragging.current) return;
          const diff = e.touches[0].clientX - startX.current;
          setOffset(Math.min(0, Math.max(-120, diff)));
        }}
        onTouchEnd={() => {
          dragging.current = false;
          setOffset(offset < -60 ? -100 : 0);
        }}
      >
        {children}
      </div>
    </div>
  );
}

export function MobileDataCards({
  records,
  fields,
  titleKey,
  subtitleKey,
  getTitle,
  getSubtitle,
  isLoading,
  emptyMessage = "لا توجد سجلات",
  emptyTitle,
  emptyActionLabel,
  onEmptyAction,
  onEdit,
  onDelete,
  onView,
  onClick,
  renderActions,
  renderStatusBadge,
  getCardClassName,
  selectedIds,
  onToggleSelect,
  headerExtra,
  maxVisibleFields = 3,
}: MobileDataCardsProps) {
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());

  if (isLoading) return <CardListSkeleton />;

  if (records.length === 0) {
    return (
      <div className="md:hidden">
        <EmptyState
          title={emptyTitle ?? emptyMessage}
          description={emptyTitle ? emptyMessage : undefined}
          actionLabel={emptyActionLabel}
          onAction={onEmptyAction}
        />
      </div>
    );
  }

  return (
    <div className="space-y-3 md:hidden">
      {records.map((record) => {
        const id = Number(record.id);
        const title = getTitle
          ? getTitle(record)
          : titleKey ? String(record[titleKey] ?? "") : "";
        const subtitle = getSubtitle
          ? getSubtitle(record)
          : subtitleKey ? String(record[subtitleKey] ?? "") : "";
        const selected = selectedIds?.includes(id);
        const expanded = expandedIds.has(id);
        const visibleFields = expanded ? fields : fields.slice(0, maxVisibleFields);
        const hasMore = fields.length > maxVisibleFields;

        const swipeActions = (onView || onEdit || onDelete) ? (
          <>
            {onView && (
              <Button variant="secondary" size="icon" className="h-9 w-9" onClick={() => onView(record)}>
                <Eye className="h-4 w-4" />
              </Button>
            )}
            {onEdit && (
              <Button variant="secondary" size="icon" className="h-9 w-9" onClick={() => onEdit(record)}>
                <Edit className="h-4 w-4" />
              </Button>
            )}
            {onDelete && (
              <Button variant="destructive" size="icon" className="h-9 w-9" onClick={() => onDelete(record)}>
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
          </>
        ) : undefined;

        return (
          <SwipeableCard key={id} swipeActions={swipeActions}>
            <Card
              className={`overflow-hidden ${selected ? "ring-2 ring-primary/40" : ""} ${getCardClassName?.(record) ?? ""} ${onClick ? "cursor-pointer active:scale-[0.99] transition-transform" : ""}`}
              onClick={onClick ? () => onClick(record) : undefined}
            >
              <CardContent className="p-4 space-y-3 bg-card">
                <div className="flex items-start gap-3">
                  {onToggleSelect && (
                    <Checkbox
                      checked={!!selected}
                      onCheckedChange={(checked) => onToggleSelect(id, !!checked)}
                      onClick={(e) => e.stopPropagation()}
                      className="mt-1"
                    />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        {title && <div className="font-semibold text-sm leading-6">{title}</div>}
                        {subtitle && <p className="text-xs text-muted-foreground truncate mt-0.5">{subtitle}</p>}
                      </div>
                      {renderStatusBadge?.(record) && (
                        <div className="shrink-0" onClick={(e) => e.stopPropagation()}>
                          {renderStatusBadge(record)}
                        </div>
                      )}
                    </div>
                    {headerExtra?.(record)}
                  </div>
                  {!renderActions && (
                    <div className="flex gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                      {onView && (
                        <Button variant="ghost" size="icon" className="h-9 w-9" onClick={() => onView(record)}>
                          <Eye className="h-4 w-4" />
                        </Button>
                      )}
                      {!swipeActions && onEdit && (
                        <Button variant="ghost" size="icon" className="h-9 w-9" onClick={() => onEdit(record)}>
                          <Edit className="h-4 w-4" />
                        </Button>
                      )}
                      {!swipeActions && onDelete && (
                        <Button variant="ghost" size="icon" className="h-9 w-9 text-destructive" onClick={() => onDelete(record)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  )}
                </div>
                <dl className="grid grid-cols-1 gap-2">
                  {visibleFields.map((field) => {
                    const value = record[field.key];
                    if (value == null || value === "") return null;
                    return (
                      <div key={field.key} className="flex items-start justify-between gap-3 text-sm">
                        <dt className="text-muted-foreground shrink-0">{field.label}</dt>
                        <dd className="text-left font-medium break-words">
                          {field.render ? field.render(value, record) : String(value)}
                        </dd>
                      </div>
                    );
                  })}
                </dl>
                {hasMore && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full h-8 text-xs text-muted-foreground"
                    onClick={(e) => {
                      e.stopPropagation();
                      setExpandedIds((prev) => {
                        const next = new Set(prev);
                        if (next.has(id)) next.delete(id);
                        else next.add(id);
                        return next;
                      });
                    }}
                  >
                    <ChevronDown className={`h-3.5 w-3.5 ml-1 transition-transform ${expanded ? "rotate-180" : ""}`} />
                    {expanded ? "عرض أقل" : "عرض المزيد"}
                  </Button>
                )}
                {renderActions && (
                  <div className="flex flex-wrap gap-1 pt-1 border-t" onClick={(e) => e.stopPropagation()}>
                    {renderActions(record)}
                  </div>
                )}
              </CardContent>
            </Card>
          </SwipeableCard>
        );
      })}
    </div>
  );
}
