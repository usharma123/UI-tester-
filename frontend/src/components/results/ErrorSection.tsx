import { useAppStore } from "@/store/useAppStore";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AlertCircle, RotateCcw } from "lucide-react";

export function ErrorSection() {
  const status = useAppStore((s) => s.status);
  const error = useAppStore((s) => s.error);
  const reset = useAppStore((s) => s.reset);

  if (status !== "error" || !error) return null;

  return (
    <section className="mb-10 animate-slide-up">
      <Card className="border-red-500/30 bg-red-500/5">
        <CardContent className="p-8">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-xl bg-red-500/10 flex items-center justify-center shrink-0">
              <AlertCircle className="w-6 h-6 text-red-500" />
            </div>
            <div className="flex-1">
              <h3 className="text-lg font-semibold text-red-600 mb-2">
                Test Failed
              </h3>
              <p className="text-sm text-muted-foreground mb-4">
                {error}
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={reset}
                className="gap-2"
              >
                <RotateCcw className="w-4 h-4" />
                Try Again
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </section>
  );
}
