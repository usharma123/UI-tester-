import { AppLayout } from "@/components/layout/AppLayout";
import { UrlForm } from "@/components/url-form/UrlForm";
import { ProgressSection } from "@/components/progress/ProgressSection";
import { ResultsSection } from "@/components/results/ResultsSection";
import { Toaster } from "@/components/ui/sonner";

export default function App() {
  return (
    <>
      <AppLayout>
        <UrlForm />
        <ProgressSection />
        <ResultsSection />
      </AppLayout>
      <Toaster position="bottom-right" richColors closeButton />
    </>
  );
}
