import { useState, useEffect } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { useAuth } from "@clerk/clerk-react";
import { useQuery } from "convex/react";
import { api } from "convex/_generated/api";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, Loader2, Zap, ArrowRight, AlertCircle } from "lucide-react";

interface SessionStatus {
  sessionId: string;
  status: string;
  paymentStatus: string;
  tier: string | null;
  credits: number | null;
  purchase: {
    status: string;
    creditsAdded: number;
  } | null;
}

export function PurchaseSuccess() {
  const [searchParams] = useSearchParams();
  const sessionId = searchParams.get("session_id");
  const { getToken } = useAuth();
  const remainingRuns = useQuery(api.users.getRemainingRuns);

  const [sessionStatus, setSessionStatus] = useState<SessionStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!sessionId) {
      setError("No session ID provided");
      setLoading(false);
      return;
    }

    const fetchStatus = async () => {
      try {
        const token = await getToken({ template: "convex" });

        const response = await fetch(`/api/checkout/session/${sessionId}`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        if (!response.ok) {
          throw new Error("Failed to fetch session status");
        }

        const data = await response.json();
        setSessionStatus(data);

        // If payment is still processing, poll again
        if (data.paymentStatus === "unpaid" || !data.purchase?.status) {
          setTimeout(fetchStatus, 2000);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load purchase status");
      } finally {
        setLoading(false);
      }
    };

    fetchStatus();
  }, [sessionId, getToken]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6">
            <div className="flex flex-col items-center gap-4">
              <Loader2 className="w-12 h-12 animate-spin text-primary" />
              <p className="text-lg font-medium">Processing your purchase...</p>
              <p className="text-sm text-muted-foreground">
                Please wait while we confirm your payment
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error || !sessionStatus) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Card className="w-full max-w-md">
          <CardHeader>
            <div className="flex justify-center mb-4">
              <AlertCircle className="w-16 h-16 text-destructive" />
            </div>
            <CardTitle className="text-center">Something went wrong</CardTitle>
            <CardDescription className="text-center">
              {error || "Unable to verify your purchase"}
            </CardDescription>
          </CardHeader>
          <CardFooter className="justify-center">
            <Button asChild>
              <Link to="/">Return to Dashboard</Link>
            </Button>
          </CardFooter>
        </Card>
      </div>
    );
  }

  const isCompleted =
    sessionStatus.paymentStatus === "paid" &&
    sessionStatus.purchase?.status === "completed";

  const tierNames: Record<string, string> = {
    starter: "Starter Pack",
    pro: "Pro Pack",
    team: "Team Pack",
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <div className="flex justify-center mb-4">
            {isCompleted ? (
              <div className="relative">
                <CheckCircle2 className="w-20 h-20 text-green-500" />
                <div className="absolute inset-0 bg-green-500/20 rounded-full animate-ping" />
              </div>
            ) : (
              <Loader2 className="w-16 h-16 animate-spin text-primary" />
            )}
          </div>
          <CardTitle className="text-center text-2xl">
            {isCompleted ? "Purchase Successful!" : "Processing Payment..."}
          </CardTitle>
          <CardDescription className="text-center text-base">
            {isCompleted
              ? "Your credits have been added to your account"
              : "Please wait while we confirm your payment"}
          </CardDescription>
        </CardHeader>

        {isCompleted && (
          <CardContent>
            <div className="bg-muted/50 rounded-lg p-6 space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Package</span>
                <span className="font-medium">
                  {sessionStatus.tier
                    ? tierNames[sessionStatus.tier] || sessionStatus.tier
                    : "Unknown"}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Credits Added</span>
                <Badge variant="secondary" className="text-base gap-1">
                  <Zap className="w-4 h-4" />+{sessionStatus.credits || sessionStatus.purchase?.creditsAdded || 0}
                </Badge>
              </div>
              <div className="border-t pt-4 flex justify-between items-center">
                <span className="text-muted-foreground">New Balance</span>
                <Badge className="text-lg px-3 py-1 gap-1.5 bg-green-600 hover:bg-green-600">
                  <Zap className="w-4 h-4" />
                  {remainingRuns ?? "..."} runs
                </Badge>
              </div>
            </div>
          </CardContent>
        )}

        <CardFooter className="flex-col gap-3">
          <Button asChild className="w-full" size="lg">
            <Link to="/">
              Start Testing
              <ArrowRight className="w-4 h-4 ml-2" />
            </Link>
          </Button>
          {isCompleted && (
            <Button asChild variant="ghost" className="w-full">
              <Link to="/pricing">Buy More Credits</Link>
            </Button>
          )}
        </CardFooter>
      </Card>
    </div>
  );
}
