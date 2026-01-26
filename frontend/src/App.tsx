import { Routes, Route } from "react-router-dom";
import { AppLayout } from "@/components/layout/AppLayout";
import { UrlForm } from "@/components/url-form/UrlForm";
import { ProgressSection } from "@/components/progress/ProgressSection";
import { ResultsSection } from "@/components/results/ResultsSection";
import { RunningBanner } from "@/components/progress/RunningBanner";
import { ErrorSection } from "@/components/results/ErrorSection";
import { LowBalanceWarning } from "@/components/LowBalanceWarning";
import { Pricing } from "@/pages/Pricing";
import { PurchaseSuccess } from "@/pages/PurchaseSuccess";
import { Toaster } from "@/components/ui/sonner";

function Dashboard() {
  return (
    <AppLayout>
      <LowBalanceWarning />
      <UrlForm />
      <RunningBanner />
      <ProgressSection />
      <ErrorSection />
      <ResultsSection />
    </AppLayout>
  );
}

export default function App() {
  return (
    <>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/pricing" element={<Pricing />} />
        <Route path="/purchase/success" element={<PurchaseSuccess />} />
      </Routes>
      <Toaster position="bottom-right" richColors closeButton />
    </>
  );
}
