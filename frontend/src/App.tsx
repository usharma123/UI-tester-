import { AppLayout } from "@/components/layout/AppLayout";
import { UrlForm } from "@/components/url-form/UrlForm";
import { ProgressSection } from "@/components/progress/ProgressSection";
import { ResultsSection } from "@/components/results/ResultsSection";
import { RunningBanner } from "@/components/progress/RunningBanner";
import { ErrorSection } from "@/components/results/ErrorSection";
import { Toaster } from "@/components/ui/sonner";

export default function App() {
  return (
    <>
      <AppLayout>
        <UrlForm />
        <RunningBanner />
        <ProgressSection />
        <ErrorSection />
        <ResultsSection />
      </AppLayout>
      <Toaster position="bottom-right" richColors closeButton />
    </>
  );
}
