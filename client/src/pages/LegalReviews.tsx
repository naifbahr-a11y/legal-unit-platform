import { useEffect, useMemo, useRef, useState } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { MobileDataCards } from "@/components/MobileDataCards";
import { PageToolbar } from "@/components/PageToolbar";
import { useRegisterPageActions } from "@/contexts/PageActionsContext";
import { hasFullAccess } from "@shared/userRoles";
import { canWriteSection, canAccessSection } from "@shared/userPermissions";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  FileSearch, Plus, Trash2, UserCheck, Clock, CheckCircle, XCircle, Search, History, ExternalLink, AlertTriangle,
} from "lucide-react";
import { toast } from "sonner";

const PRIORITY_MAP: Record<string, { label: string; color: string }> = {
  urgent: { label: "عاجل", color: "bg-red-100 text-red-800 border-red-300" },
  medium: { label: "متوسط", color: "bg-yellow-100 text-yellow-800 border-yellow-300" },
  normal: { label: "عادي", color: "bg-blue-100 text-blue-800 border-blue-300" },
};

const FOLLOWUP_STATUS_MAP: Record<string, { label: string; color: string }> = {
  awaiting_submission: { label: "مطلوب: آخر الإجراءات", color: "bg-orange-100 text-orange-800" },
  pending_approval: { label: "متابعة بانتظار الموافقة", color: "bg-amber-100 text-amber-900" },
  approved: { label: "تم تحديث القضية", color: "bg-green-100 text-green-800" },
  rejected: { label: "متابعة مرفوضة", color: "bg-red-100 text-red-800" },
};

const STATUS_MAP: Record<string, { label: string; color: string; icon: typeof Clock }> = {
  new: { label: "جديد", color: "bg-blue-100 text-blue-800", icon: Clock },
  in_review: { label: "قيد المراجعة", color: "bg-yellow-100 text-yellow-800", icon: FileSearch },
  completed: { label: "مكتمل", color: "bg-green-100 text-green-800", icon: CheckCircle },
  rejected: { label: "مرفوض", color: "bg-red-100 text-red-800", icon: XCircle },
};

type ReviewItem = {
  id: number;
  title: string;
  reviewDate: string;
  requestDate?: string | null;
  location?: string | null;
  priority?: string | null;
  description?: string | null;
  assignedTo?: string | null;
  assignedToId?: number | null;
  status?: string | null;
  reviewNotes?: string | null;
  relatedCaseId?: number | null;
  relatedCase?: { caseNumber: string | null; subject: string | null } | null;
  attachmentUrl?: string | null;
  createdBy?: number | null;
  createdByName?: string | null;
  followupStatus?: string | null;
  followupActions?: string | null;
  followupRejectNote?: string | null;
};

function ReviewCardContent({
  review,
  canWrite,
  isPrivileged,
  currentUserId,
  allUsers,
  onEdit,
  onDelete,
  onAssign,
  onStatusChange,
  onApprove,
  onReject,
  onTrail,
  onSubmitFollowup,
  onApproveFollowup,
  onRejectFollowup,
  highlighted,
}: {
  review: ReviewItem;
  canWrite: boolean;
  isPrivileged: boolean;
  currentUserId?: number;
  allUsers: { id: number; displayName: string }[];
  onEdit: () => void;
  onDelete: () => void;
  onAssign: (userId: number, userName: string) => void;
  onStatusChange: (status: string) => void;
  onApprove: () => void;
  onReject: () => void;
  onTrail: () => void;
  onSubmitFollowup: () => void;
  onApproveFollowup: () => void;
  onRejectFollowup: () => void;
  highlighted?: boolean;
}) {
  const priorityInfo = PRIORITY_MAP[review.priority || "normal"] || PRIORITY_MAP.normal;
  const statusInfo = STATUS_MAP[review.status || "new"] || STATUS_MAP.new;
  const StatusIcon = statusInfo.icon;
  const canDelete = isPrivileged || review.createdBy === currentUserId;
  const followupInfo = review.followupStatus && review.followupStatus !== "none"
    ? FOLLOWUP_STATUS_MAP[review.followupStatus]
    : null;
  const isFollowupOwner = currentUserId != null && (
    review.assignedToId === currentUserId || review.createdBy === currentUserId
  );
  const canSubmitFollowup = !!review.relatedCaseId && isFollowupOwner && canWrite
    && ["awaiting_submission", "rejected", "none"].includes(review.followupStatus || "none");

  return (
    <div
      id={`legal-review-${review.id}`}
      className={`flex items-start justify-between gap-4 ${highlighted ? "ring-2 ring-purple-400 rounded-lg p-1" : ""}`}
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1 flex-wrap">
          <h3 className="font-semibold">{review.title}</h3>
          <span className={`px-2 py-0.5 rounded-full text-xs border ${priorityInfo.color}`}>{priorityInfo.label}</span>
          <span className={`px-2 py-0.5 rounded-full text-xs flex items-center gap-1 ${statusInfo.color}`}>
            <StatusIcon className="w-3 h-3" /> {statusInfo.label}
          </span>
          <span className="text-xs text-muted-foreground">#{review.id}</span>
        </div>
        <div className="text-sm text-muted-foreground space-y-1">
          {review.requestDate && <div>تاريخ الطلب: {review.requestDate}</div>}
          <div>تاريخ المراجعة: {review.reviewDate}</div>
          {review.location && <div>المكان: {review.location}</div>}
          {review.description && <div className="mt-1">{review.description}</div>}
          {review.reviewNotes && (
            <div className="text-xs bg-muted p-2 rounded mt-1">ملاحظات المراجعة: {review.reviewNotes}</div>
          )}
          {review.relatedCaseId && (
            <a href={`/cases/${review.relatedCaseId}`} className="text-green-700 hover:underline text-xs flex items-center gap-1">
              <ExternalLink className="w-3 h-3" />
              قضية المتابعة: {review.relatedCase?.caseNumber || `#${review.relatedCaseId}`}
              {review.relatedCase?.subject ? ` — ${review.relatedCase.subject}` : ""}
            </a>
          )}
          {followupInfo && (
            <span className={`inline-block text-xs px-2 py-0.5 rounded mt-1 ${followupInfo.color}`}>
              {followupInfo.label}
            </span>
          )}
          {review.followupActions && review.followupStatus !== "approved" && (
            <div className="text-xs bg-muted p-2 rounded mt-1 whitespace-pre-wrap">
              آخر الإجراءات المقترحة: {review.followupActions}
            </div>
          )}
          {review.followupRejectNote && review.followupStatus === "rejected" && (
            <div className="text-xs text-red-700 bg-red-50 p-2 rounded mt-1">
              سبب رفض المتابعة: {review.followupRejectNote}
            </div>
          )}
          {review.attachmentUrl && (
            <a href={review.attachmentUrl} target="_blank" rel="noreferrer" className="text-blue-700 hover:underline text-xs block">
              مرفق
            </a>
          )}
          <div className="flex items-center gap-4 mt-2 flex-wrap">
            {review.assignedTo ? (
              <span className="flex items-center gap-1 text-green-700"><UserCheck className="w-3 h-3" /> مسند إلى: {review.assignedTo}</span>
            ) : (
              <span className="text-orange-600">غير مسند</span>
            )}
            <span className="text-xs">أنشأه: {review.createdByName}</span>
          </div>
        </div>
      </div>
      <div className="flex flex-col gap-1 shrink-0">
        <Button variant="ghost" size="sm" onClick={onTrail}><History className="w-3 h-3 ml-1" /> التتبع</Button>
        {canWrite && (
          <Button variant="ghost" size="sm" onClick={onEdit}>تعديل</Button>
        )}
        {isPrivileged && review.status === "new" && (
          <Select onValueChange={(v) => {
            const u = allUsers.find((u) => u.id === Number(v));
            if (u) onAssign(u.id, u.displayName);
          }}>
            <SelectTrigger className="h-7 text-xs w-[100px]"><SelectValue placeholder="إسناد" /></SelectTrigger>
            <SelectContent>
              {allUsers.map((u) => <SelectItem key={u.id} value={String(u.id)}>{u.displayName}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
        {isPrivileged && (
          <>
            <Select value={review.status || "new"} onValueChange={onStatusChange}>
              <SelectTrigger className="h-7 text-xs w-[100px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="new">جديد</SelectItem>
                <SelectItem value="in_review">قيد المراجعة</SelectItem>
                <SelectItem value="completed">مكتمل</SelectItem>
                <SelectItem value="rejected">مرفوض</SelectItem>
              </SelectContent>
            </Select>
            {(review.status === "new" || review.status === "in_review") && (
              <div className="flex gap-1 mt-1">
                <Button variant="ghost" size="sm" className="h-7 text-xs text-green-700 hover:bg-green-50 px-2" onClick={onApprove}>
                  ✔ قبول
                </Button>
                <Button variant="ghost" size="sm" className="h-7 text-xs text-red-600 hover:bg-red-50 px-2" onClick={onReject}>
                  ✖ رفض
                </Button>
              </div>
            )}
          </>
        )}
        {canSubmitFollowup && (
          <Button variant="outline" size="sm" className="text-orange-700" onClick={onSubmitFollowup}>
            إدخال آخر الإجراءات
          </Button>
        )}
        {isPrivileged && review.followupStatus === "pending_approval" && (
          <div className="flex gap-1">
            <Button variant="ghost" size="sm" className="h-7 text-xs text-green-700" onClick={onApproveFollowup}>
              ✔ اعتماد المتابعة
            </Button>
            <Button variant="ghost" size="sm" className="h-7 text-xs text-red-600" onClick={onRejectFollowup}>
              ✖ رفض المتابعة
            </Button>
          </div>
        )}
        {canWrite && canDelete && (
          <Button variant="ghost" size="sm" className="text-red-600" onClick={onDelete}>
            <Trash2 className="w-3 h-3" />
          </Button>
        )}
      </div>
    </div>
  );
}

export default function LegalReviews() {
  const { user } = useAuth();
  const [showForm, setShowForm] = useState(false);
  const [editItem, setEditItem] = useState<ReviewItem | null>(null);
  const [statusFilter, setStatusFilter] = useState("");
  const [priorityFilter, setPriorityFilter] = useState("");
  const [search, setSearch] = useState("");
  const [approveId, setApproveId] = useState<number | null>(null);
  const [rejectId, setRejectId] = useState<number | null>(null);
  const [reviewNotes, setReviewNotes] = useState("");
  const [trailReviewId, setTrailReviewId] = useState<number | null>(null);
  const [trailNote, setTrailNote] = useState("");
  const [caseSearch, setCaseSearch] = useState("");
  const [followupReviewId, setFollowupReviewId] = useState<number | null>(null);
  const [followupText, setFollowupText] = useState("");
  const [rejectFollowupId, setRejectFollowupId] = useState<number | null>(null);
  const [rejectFollowupNote, setRejectFollowupNote] = useState("");
  const didScroll = useRef(false);

  const isPrivileged = user ? hasFullAccess(user.role) : false;
  const canWrite = user ? canWriteSection(user, "legal_reviews") : false;
  const canLinkCases = user ? canAccessSection(user, "cases") : false;

  const prefillCaseId = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get("caseId");
  }, []);

  const highlightId = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    const id = params.get("id");
    return id ? Number(id) : null;
  }, []);

  const [form, setForm] = useState({
    title: "", reviewDate: "", location: "", priority: "normal",
    description: "", assignedTo: "", assignedToId: 0, requestDate: "",
    relatedCaseId: "", attachmentUrl: "",
  });

  const [page, setPage] = useState(1);
  const PAGE_SIZE = 50;

  const utils = trpc.useUtils();
  const { data: listResult, isLoading, isError, refetch } = trpc.legalReviews.list.useQuery({
    status: statusFilter && statusFilter !== "all" ? statusFilter : undefined,
    priority: priorityFilter && priorityFilter !== "all" ? priorityFilter : undefined,
    search: search.trim() || undefined,
    page,
    pageSize: PAGE_SIZE,
  });
  const reviews = listResult?.items ?? [];
  const totalReviews = listResult?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalReviews / PAGE_SIZE));
  const { data: linkableCases = [] } = trpc.legalReviews.linkableCases.useQuery(
    { search: caseSearch.trim() || undefined },
    { enabled: showForm && canLinkCases },
  );
  const { data: allUsers = [] } = trpc.users.list.useQuery(undefined, { enabled: isPrivileged });
  const { data: createBlock } = trpc.legalReviews.createBlock.useQuery(undefined, {
    enabled: canWrite && !isPrivileged,
  });
  const canCreateNew = isPrivileged || !createBlock?.blocked;

  useEffect(() => {
    if (prefillCaseId && canLinkCases) {
      setForm((f) => ({ ...f, relatedCaseId: prefillCaseId }));
    }
  }, [prefillCaseId, canLinkCases]);

  const { data: trail = [] } = trpc.legalReviews.trail.useQuery(
    { reviewId: trailReviewId! },
    { enabled: trailReviewId != null },
  );

  const approveMut = trpc.legalReviews.approve.useMutation({
    onSuccess: () => {
      utils.legalReviews.invalidate();
      setApproveId(null);
      setReviewNotes("");
      toast.success("تمت الموافقة وتم إشعار الموظف");
    },
    onError: (e) => toast.error(e.message),
  });
  const rejectMut = trpc.legalReviews.reject.useMutation({
    onSuccess: () => {
      utils.legalReviews.invalidate();
      setRejectId(null);
      setReviewNotes("");
      toast.success("تم الرفض وتم إشعار الموظف");
    },
    onError: (e) => toast.error(e.message),
  });
  const createMut = trpc.legalReviews.create.useMutation({
    onSuccess: () => {
      utils.legalReviews.invalidate();
      utils.legalReviews.createBlock.invalidate();
      utils.dashboard.stats.invalidate();
      setShowForm(false);
      resetForm();
      toast.success("تم إنشاء الطلب");
    },
    onError: (e) => toast.error(e.message),
  });
  const updateMut = trpc.legalReviews.update.useMutation({
    onSuccess: () => {
      utils.legalReviews.invalidate();
      setShowForm(false);
      setEditItem(null);
      resetForm();
      toast.success("تم التحديث");
    },
    onError: (e) => toast.error(e.message),
  });
  const deleteMut = trpc.legalReviews.delete.useMutation({
    onSuccess: () => {
      utils.legalReviews.invalidate();
      utils.dashboard.stats.invalidate();
      toast.success("تم الحذف");
    },
    onError: (e) => toast.error(e.message),
  });
  const addTrailMut = trpc.legalReviews.addTrail.useMutation({
    onSuccess: () => {
      utils.legalReviews.trail.invalidate();
      setTrailNote("");
      toast.success("تمت إضافة الملاحظة");
    },
  });
  const submitFollowupMut = trpc.legalReviews.submitFollowup.useMutation({
    onSuccess: () => {
      utils.legalReviews.invalidate();
      utils.legalReviews.createBlock.invalidate();
      setFollowupReviewId(null);
      setFollowupText("");
      toast.success("تم إرسال آخر الإجراءات للموافقة");
    },
    onError: (e) => toast.error(e.message),
  });
  const approveFollowupMut = trpc.legalReviews.approveFollowup.useMutation({
    onSuccess: () => {
      utils.legalReviews.invalidate();
      toast.success("تم اعتماد المتابعة وتحديث القضية");
    },
    onError: (e) => toast.error(e.message),
  });
  const rejectFollowupMut = trpc.legalReviews.rejectFollowup.useMutation({
    onSuccess: () => {
      utils.legalReviews.invalidate();
      setRejectFollowupId(null);
      setRejectFollowupNote("");
      toast.success("تم رفض المتابعة");
    },
    onError: (e) => toast.error(e.message),
  });

  useRegisterPageActions({
    onAdd: canWrite && canCreateNew ? () => { resetForm(); setEditItem(null); setShowForm(true); } : undefined,
  });

  function openNewReviewForm() {
    if (!canCreateNew) {
      toast.error("أكمل متابعة المراجعة السابقة قبل تقديم طلب جديد");
      return;
    }
    resetForm();
    setEditItem(null);
    setShowForm(true);
  }

  function resetForm() {
    setForm({
      title: "", reviewDate: "", location: "", priority: "normal",
      description: "", assignedTo: "", assignedToId: 0, requestDate: "",
      relatedCaseId: "", attachmentUrl: "",
    });
  }

  function openEdit(item: ReviewItem) {
    setEditItem(item);
    setForm({
      title: item.title || "", reviewDate: item.reviewDate || "",
      location: item.location || "", priority: item.priority || "normal",
      description: item.description || "", assignedTo: item.assignedTo || "",
      assignedToId: item.assignedToId || 0, requestDate: item.requestDate || "",
      relatedCaseId: item.relatedCaseId ? String(item.relatedCaseId) : "",
      attachmentUrl: item.attachmentUrl || "",
    });
    setShowForm(true);
  }

  function handleSubmit() {
    if (!form.title || !form.reviewDate) { toast.error("العنوان والتاريخ مطلوبان"); return; }
    if (!editItem && !canCreateNew) {
      toast.error("أكمل متابعة المراجعة السابقة قبل تقديم طلب جديد");
      return;
    }
    const payload = {
      ...form,
      assignedToId: form.assignedToId || undefined,
      relatedCaseId: form.relatedCaseId ? Number(form.relatedCaseId) : undefined,
      attachmentUrl: form.attachmentUrl || undefined,
    };
    if (editItem) {
      updateMut.mutate({ id: editItem.id, ...payload });
    } else {
      createMut.mutate(payload);
    }
  }

  const stats = useMemo(() => ({
    total: totalReviews,
    new: reviews.filter((r) => r.status === "new").length,
    inReview: reviews.filter((r) => r.status === "in_review").length,
    completed: reviews.filter((r) => r.status === "completed").length,
    rejected: reviews.filter((r) => r.status === "rejected").length,
  }), [reviews, totalReviews]);

  useEffect(() => { setPage(1); }, [statusFilter, priorityFilter, search]);

  useEffect(() => {
    if (!highlightId || didScroll.current || reviews.length === 0) return;
    const el = document.getElementById(`legal-review-${highlightId}`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      didScroll.current = true;
    }
  }, [highlightId, reviews]);

  const cardActions = (review: ReviewItem) => ({
    onEdit: () => openEdit(review),
    onDelete: () => { if (confirm("حذف الطلب؟")) deleteMut.mutate({ id: review.id }); },
    onAssign: (userId: number, userName: string) => updateMut.mutate({ id: review.id, assignedTo: userName, assignedToId: userId }),
    onStatusChange: (status: string) => updateMut.mutate({ id: review.id, status }),
    onApprove: () => setApproveId(review.id),
    onReject: () => setRejectId(review.id),
    onTrail: () => setTrailReviewId(review.id),
    onSubmitFollowup: () => {
      setFollowupReviewId(review.id);
      setFollowupText(review.followupActions || "");
    },
    onApproveFollowup: () => approveFollowupMut.mutate({ id: review.id }),
    onRejectFollowup: () => setRejectFollowupId(review.id),
  });

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <FileSearch className="w-6 h-6" /> طلبات المراجعة القانونية
        </h1>
        {canWrite && (
          <Button onClick={openNewReviewForm} disabled={!canCreateNew}>
            <Plus className="w-4 h-4 ml-1" /> طلب جديد
          </Button>
        )}
      </div>

      {!isPrivileged && createBlock?.blocked && (
        <Alert variant="destructive" className="border-orange-300 bg-orange-50 text-orange-950">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>لا يمكن تقديم طلب مراجعة جديد</AlertTitle>
          <AlertDescription className="space-y-2">
            <p>يجب أولاً الرد على إشعار المتابعة أو إدخال آخر الإجراءات أو تحديث القضية المرتبطة بالطلبات التالية:</p>
            <ul className="list-disc list-inside text-sm space-y-1">
              {createBlock.items.map((item) => (
                <li key={item.reviewId}>
                  <a href={`/legal-reviews?id=${item.reviewId}`} className="underline font-medium">
                    {item.title}
                  </a>
                  {" — "}
                  {item.caseNumber ? `قضية ${item.caseNumber}` : `قضية #${item.relatedCaseId}`}
                  {item.followupStatus === "rejected" && item.followupRejectNote
                    ? ` (مرفوض: ${item.followupRejectNote})`
                    : ""}
                </li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card><CardContent className="p-4 text-center"><div className="text-2xl font-bold">{stats.total}</div><div className="text-sm text-muted-foreground">إجمالي</div></CardContent></Card>
        <Card className="border-blue-200"><CardContent className="p-4 text-center"><div className="text-2xl font-bold text-blue-700">{stats.new}</div><div className="text-sm text-blue-600">جديد</div></CardContent></Card>
        <Card className="border-yellow-200"><CardContent className="p-4 text-center"><div className="text-2xl font-bold text-yellow-700">{stats.inReview}</div><div className="text-sm text-yellow-600">قيد المراجعة</div></CardContent></Card>
        <Card className="border-green-200"><CardContent className="p-4 text-center"><div className="text-2xl font-bold text-green-700">{stats.completed}</div><div className="text-sm text-green-600">مكتمل</div></CardContent></Card>
        <Card className="border-red-200"><CardContent className="p-4 text-center"><div className="text-2xl font-bold text-red-700">{stats.rejected}</div><div className="text-sm text-red-600">مرفوض</div></CardContent></Card>
      </div>

      <PageToolbar
        searchPlaceholder="بحث بالعنوان أو الوصف..."
        search={search}
        onSearchChange={setSearch}
        filters={
          <>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[150px]"><SelectValue placeholder="الحالة" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">الكل</SelectItem>
                <SelectItem value="new">جديد</SelectItem>
                <SelectItem value="in_review">قيد المراجعة</SelectItem>
                <SelectItem value="completed">مكتمل</SelectItem>
                <SelectItem value="rejected">مرفوض</SelectItem>
              </SelectContent>
            </Select>
            <Select value={priorityFilter} onValueChange={setPriorityFilter}>
              <SelectTrigger className="w-[150px]"><SelectValue placeholder="الأولوية" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">الكل</SelectItem>
                <SelectItem value="urgent">عاجل</SelectItem>
                <SelectItem value="medium">متوسط</SelectItem>
                <SelectItem value="normal">عادي</SelectItem>
              </SelectContent>
            </Select>
          </>
        }
      />

      <div className="hidden md:block space-y-3">
        {isError ? (
          <div className="text-center py-8 space-y-3">
            <p className="text-muted-foreground">تعذّر تحميل طلبات المراجعة</p>
            <Button variant="outline" size="sm" onClick={() => refetch()}>إعادة المحاولة</Button>
          </div>
        ) : isLoading ? (
          <div className="text-center py-8 text-muted-foreground">جاري التحميل...</div>
        ) : reviews.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">لا توجد طلبات مراجعة</div>
        ) : reviews.map((review) => (
          <Card key={review.id} className="hover:shadow-md transition-shadow">
            <CardContent className="p-4">
              <ReviewCardContent
                review={review}
                canWrite={canWrite}
                isPrivileged={isPrivileged}
                currentUserId={user?.id}
                allUsers={allUsers}
                highlighted={highlightId === review.id}
                {...cardActions(review)}
              />
            </CardContent>
          </Card>
        ))}
      </div>

      {totalReviews > 0 && (
        <div className="hidden md:flex flex-wrap items-center justify-between gap-2">
          <span className="text-sm text-muted-foreground">
            {totalReviews.toLocaleString()} طلب — صفحة {page} من {totalPages}
          </span>
          <div className="flex gap-1">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>السابق</Button>
            <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>التالي</Button>
          </div>
        </div>
      )}

      <div className="md:hidden">
        {isError ? (
          <div className="text-center py-8 space-y-3">
            <p className="text-muted-foreground">تعذّر تحميل طلبات المراجعة</p>
            <Button variant="outline" size="sm" onClick={() => refetch()}>إعادة المحاولة</Button>
          </div>
        ) : (
        <MobileDataCards
          records={reviews as Record<string, unknown>[]}
          isLoading={isLoading}
          emptyTitle="لا توجد طلبات مراجعة"
          emptyMessage="ابدأ بإنشاء طلب مراجعة جديد"
          emptyActionLabel={canWrite && canCreateNew ? "طلب جديد" : undefined}
          onEmptyAction={canWrite && canCreateNew ? openNewReviewForm : undefined}
          titleKey="title"
          subtitleKey="reviewDate"
          fields={[
            { key: "assignedTo", label: "مسند إلى", render: (v) => v ? String(v) : "غير مسند" },
            { key: "createdByName", label: "المنشئ" },
            { key: "location", label: "المكان" },
          ]}
          renderStatusBadge={(item) => {
            const s = STATUS_MAP[String(item.status)] || STATUS_MAP.new;
            const Icon = s.icon;
            return <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs ${s.color}`}><Icon className="w-3 h-3" />{s.label}</span>;
          }}
          onCardClick={(item) => openEdit(item as ReviewItem)}
        />
        )}
      </div>

      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editItem ? "تعديل طلب مراجعة" : "إنشاء طلب مراجعة جديد"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div>
              <Label className="text-sm font-medium">عنوان الطلب *</Label>
              <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="مثال: مراجعة عقد إيجار" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-sm font-medium">تاريخ طلب المراجعة</Label>
                <Input type="date" value={form.requestDate} onChange={(e) => setForm({ ...form, requestDate: e.target.value })} />
              </div>
              <div>
                <Label className="text-sm font-medium">تاريخ المراجعة *</Label>
                <Input type="date" value={form.reviewDate} onChange={(e) => setForm({ ...form, reviewDate: e.target.value })} />
              </div>
            </div>
            <div>
              <Label className="text-sm font-medium">مكان المراجعة</Label>
              <Input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-sm font-medium">الأولوية</Label>
                <Select value={form.priority} onValueChange={(v) => setForm({ ...form, priority: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="urgent">عاجل</SelectItem>
                    <SelectItem value="medium">متوسط</SelectItem>
                    <SelectItem value="normal">عادي</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {isPrivileged && (
                <div>
                  <Label className="text-sm font-medium">إسناد إلى</Label>
                  <Select value={String(form.assignedToId || "")} onValueChange={(v) => {
                    const u = allUsers.find((u) => u.id === Number(v));
                    if (u) setForm({ ...form, assignedTo: u.displayName, assignedToId: u.id });
                  }}>
                    <SelectTrigger><SelectValue placeholder="اختر موظف" /></SelectTrigger>
                    <SelectContent>
                      {allUsers.map((u) => <SelectItem key={u.id} value={String(u.id)}>{u.displayName}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
            {form.reviewDate && form.assignedToId > 0 && (
              <EmployeeAvailability
                date={form.reviewDate}
                employee={allUsers.find((u) => u.id === form.assignedToId)?.displayName || ""}
              />
            )}
            {canLinkCases ? (
              <div>
                <Label className="text-sm font-medium">قضية المتابعة (اختياري)</Label>
                <p className="text-xs text-muted-foreground mb-2">
                  اختر القضية التي يخص هذا الطلب متابعتها أو مراجعتها
                </p>
                <Input
                  className="mb-2"
                  placeholder="بحث برقم القضية أو العنوان..."
                  value={caseSearch}
                  onChange={(e) => setCaseSearch(e.target.value)}
                />
                <Select
                  value={form.relatedCaseId || "none"}
                  onValueChange={(v) => setForm({ ...form, relatedCaseId: v === "none" ? "" : v })}
                >
                  <SelectTrigger><SelectValue placeholder="اختر قضية" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">بدون ربط بقضية</SelectItem>
                    {linkableCases.map((c) => (
                      <SelectItem key={c.id} value={String(c.id)}>
                        {c.caseNumber || `#${c.id}`} — {c.subject || "بدون عنوان"}
                        {c.employee ? ` (${c.employee})` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground bg-muted p-2 rounded">
                لربط الطلب بقضية، يلزم صلاحية الوصول إلى سجل القضايا.
              </p>
            )}
            <div>
              <Label className="text-sm font-medium">رابط مرفق (اختياري)</Label>
              <Input value={form.attachmentUrl} onChange={(e) => setForm({ ...form, attachmentUrl: e.target.value })} placeholder="https://..." />
            </div>
            <div>
              <Label className="text-sm font-medium">وصف تفصيلي</Label>
              <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={4} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowForm(false)}>إلغاء</Button>
            <Button onClick={handleSubmit} disabled={createMut.isPending || updateMut.isPending}>
              {editItem ? "تحديث" : "إنشاء"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={approveId !== null} onOpenChange={() => { setApproveId(null); setReviewNotes(""); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>الموافقة على الطلب</DialogTitle></DialogHeader>
          <div className="space-y-2">
            <Label>ملاحظات (اختياري)</Label>
            <Textarea value={reviewNotes} onChange={(e) => setReviewNotes(e.target.value)} rows={3} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setApproveId(null)}>إلغاء</Button>
            <Button
              className="bg-green-700 hover:bg-green-800"
              onClick={() => approveId && approveMut.mutate({ id: approveId, reviewNotes: reviewNotes || undefined })}
              disabled={approveMut.isPending}
            >
              موافقة
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={rejectId !== null} onOpenChange={() => { setRejectId(null); setReviewNotes(""); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>رفض الطلب</DialogTitle></DialogHeader>
          <div className="space-y-2">
            <Label>سبب الرفض *</Label>
            <Textarea value={reviewNotes} onChange={(e) => setReviewNotes(e.target.value)} rows={3} placeholder="اذكر سبب الرفض..." />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectId(null)}>إلغاء</Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (!reviewNotes.trim()) { toast.error("سبب الرفض مطلوب"); return; }
                if (rejectId) rejectMut.mutate({ id: rejectId, reviewNotes });
              }}
              disabled={rejectMut.isPending}
            >
              رفض
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={trailReviewId !== null} onOpenChange={() => { setTrailReviewId(null); setTrailNote(""); }}>
        <DialogContent className="max-w-md max-h-[80vh] overflow-y-auto">
          <DialogHeader><DialogTitle>سجل تتبع الطلب</DialogTitle></DialogHeader>
          <div className="space-y-2 mb-4">
            {trail.length === 0 ? (
              <p className="text-sm text-muted-foreground">لا توجد أحداث تتبع</p>
            ) : trail.map((t) => (
              <div key={t.id} className="border rounded p-2 text-sm">
                <div className="font-medium">{t.action} — {t.performedByName}</div>
                {t.notes && <p className="text-muted-foreground">{t.notes}</p>}
                <div className="text-xs text-muted-foreground">{new Date(t.createdAt).toLocaleString("ar-IQ")}</div>
              </div>
            ))}
          </div>
          {canWrite && trailReviewId && (
            <div className="space-y-2 border-t pt-3">
              <Label>إضافة ملاحظة تتبع</Label>
              <Textarea value={trailNote} onChange={(e) => setTrailNote(e.target.value)} rows={2} />
              <Button
                size="sm"
                onClick={() => addTrailMut.mutate({ reviewId: trailReviewId, action: "note", notes: trailNote })}
                disabled={!trailNote.trim() || addTrailMut.isPending}
              >
                إضافة
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={followupReviewId !== null} onOpenChange={() => { setFollowupReviewId(null); setFollowupText(""); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>إدخال آخر الإجراءات</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">
            اذكر آخر الإجراءات التي تمت بخصوص القضية المرتبطة في يوم المراجعة. سيتم إرسالها للمدير للموافقة قبل تحديث القضية.
          </p>
          <div className="space-y-2">
            <Label>آخر الإجراءات *</Label>
            <Textarea
              value={followupText}
              onChange={(e) => setFollowupText(e.target.value)}
              rows={5}
              placeholder="مثال: تم الاطلاع على الملف، إعداد مذكرة دفاع، التواصل مع الجهة المعنية..."
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setFollowupReviewId(null); setFollowupText(""); }}>إلغاء</Button>
            <Button
              className="bg-orange-700 hover:bg-orange-800"
              onClick={() => {
                if (!followupText.trim()) { toast.error("يرجى إدخال آخر الإجراءات"); return; }
                if (followupReviewId) submitFollowupMut.mutate({ id: followupReviewId, lastActions: followupText.trim() });
              }}
              disabled={submitFollowupMut.isPending}
            >
              إرسال للموافقة
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={rejectFollowupId !== null} onOpenChange={() => { setRejectFollowupId(null); setRejectFollowupNote(""); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>رفض متابعة المراجعة</DialogTitle></DialogHeader>
          <div className="space-y-2">
            <Label>سبب الرفض *</Label>
            <Textarea
              value={rejectFollowupNote}
              onChange={(e) => setRejectFollowupNote(e.target.value)}
              rows={3}
              placeholder="اذكر سبب الرفض أو التعديل المطلوب..."
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setRejectFollowupId(null); setRejectFollowupNote(""); }}>إلغاء</Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (!rejectFollowupNote.trim()) { toast.error("سبب الرفض مطلوب"); return; }
                if (rejectFollowupId) rejectFollowupMut.mutate({ id: rejectFollowupId, note: rejectFollowupNote.trim() });
              }}
              disabled={rejectFollowupMut.isPending}
            >
              رفض المتابعة
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function EmployeeAvailability({ date, employee }: { date: string; employee: string }) {
  const { data: appointments = [] } = trpc.appointments.employeeAvailability.useQuery(
    { date, employee },
    { enabled: !!date && !!employee },
  );
  if (!appointments || (appointments as unknown[]).length === 0) {
    return <div className="text-xs text-green-600 bg-green-50 p-2 rounded">الموظف متاح في هذا التاريخ</div>;
  }
  return (
    <div className="text-xs bg-yellow-50 border border-yellow-200 p-2 rounded">
      <div className="font-medium text-yellow-800 mb-1">الموظف لديه {(appointments as unknown[]).length} موعد/مواعيد في هذا اليوم:</div>
      {(appointments as { title?: string; appointmentTime?: string }[]).map((a, i) => (
        <div key={i} className="text-yellow-700">• {a.title} ({a.appointmentTime || "طوال اليوم"})</div>
      ))}
    </div>
  );
}
