import { useState } from "react";
import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";

type PrintPreviewDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
  children: React.ReactNode;
};

export function PrintPreviewDialog({
  open,
  onOpenChange,
  title = "معاينة الطباعة",
  children,
}: PrintPreviewDialogProps) {
  const [printing, setPrinting] = useState(false);

  const handlePrint = () => {
    setPrinting(true);
    window.print();
    setTimeout(() => setPrinting(false), 500);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="flex-1 overflow-auto border rounded-lg p-4 bg-white text-black print-preview-area">
          {children}
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>إغلاق</Button>
          <Button onClick={handlePrint} disabled={printing} className="bg-green-700 hover:bg-green-800">
            <Printer className="h-4 w-4 ml-1" />
            {printing ? "جاري الطباعة..." : "طباعة"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
