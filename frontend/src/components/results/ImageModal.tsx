import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface ImageModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  src: string;
  label: string;
}

export function ImageModal({ open, onOpenChange, src, label }: ImageModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[90vw] max-h-[90vh] p-0 overflow-hidden">
        <DialogHeader className="px-6 py-4 border-b border-border">
          <DialogTitle className="text-base font-medium">{label}</DialogTitle>
        </DialogHeader>
        <div className="p-4 bg-background flex items-center justify-center">
          <img
            src={src}
            alt={label}
            className="max-w-full max-h-[calc(90vh-100px)] object-contain rounded-md"
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
