import { useState, useEffect } from "react";
import { useAuth } from "@clerk/clerk-react";
import { useQuery } from "convex/react";
import { api } from "convex/_generated/api";
import { loadStripe } from "@stripe/stripe-js";
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
import { Check, Loader2, Zap, ArrowLeft, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Link } from "react-router-dom";

interface PricingTier {
  tier: string;
  name: string;
  credits: number;
  price: number;
  description: string;
  features: string[];
}

interface PricingResponse {
  tiers: PricingTier[];
  stripeConfigured: boolean;
}

// Load Stripe outside of component to avoid recreating on every render
const stripePromise = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY
  ? loadStripe(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY)
  : null;

export function Pricing() {
  const { getToken, isSignedIn } = useAuth();
  const remainingRuns = useQuery(api.users.getRemainingRuns);
  const [tiers, setTiers] = useState<PricingTier[]>([]);
  const [stripeConfigured, setStripeConfigured] = useState(false);
  const [loading, setLoading] = useState(true);
  const [purchasing, setPurchasing] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/pricing")
      .then((res) => res.json())
      .then((data: PricingResponse) => {
        setTiers(data.tiers);
        setStripeConfigured(data.stripeConfigured);
        setLoading(false);
      })
      .catch(() => {
        toast.error("Failed to load pricing");
        setLoading(false);
      });
  }, []);

  const handlePurchase = async (tier: string) => {
    if (!isSignedIn) {
      toast.error("Please sign in to purchase");
      return;
    }

    if (!stripeConfigured) {
      toast.error("Payments are not configured yet");
      return;
    }

    setPurchasing(tier);

    try {
      const token = await getToken({ template: "convex" });

      const response = await fetch("/api/checkout/create-session", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ tier }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to create checkout session");
      }

      const { url } = await response.json();

      // Redirect to Stripe Checkout
      if (url) {
        window.location.href = url;
      } else {
        throw new Error("No checkout URL returned");
      }
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to start checkout"
      );
      setPurchasing(null);
    }
  };

  const getPopularBadge = (tier: string) => {
    if (tier === "pro") {
      return (
        <Badge className="absolute -top-3 left-1/2 -translate-x-1/2 bg-primary text-primary-foreground gap-1">
          <Sparkles className="w-3 h-3" />
          Most Popular
        </Badge>
      );
    }
    return null;
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-12 max-w-6xl">
        {/* Back link */}
        <Link
          to="/"
          className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground mb-8 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Dashboard
        </Link>

        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold mb-4">Buy Test Runs</h1>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Purchase additional QA test runs for your websites. Each run includes
            comprehensive UI/UX analysis with detailed reports.
          </p>
          {remainingRuns !== undefined && remainingRuns !== null && (
            <div className="mt-6">
              <Badge variant="secondary" className="text-base px-4 py-2 gap-2">
                <Zap className="w-4 h-4" />
                Current Balance: {remainingRuns} runs
              </Badge>
            </div>
          )}
        </div>

        {/* Pricing cards */}
        <div className="grid md:grid-cols-3 gap-8">
          {tiers.map((tier) => (
            <Card
              key={tier.tier}
              className={`relative ${
                tier.tier === "pro"
                  ? "border-primary shadow-lg scale-[1.02]"
                  : "border-border"
              }`}
            >
              {getPopularBadge(tier.tier)}

              <CardHeader>
                <CardTitle className="text-2xl">{tier.name}</CardTitle>
                <CardDescription>{tier.description}</CardDescription>
              </CardHeader>

              <CardContent className="flex-1">
                <div className="mb-6">
                  <span className="text-5xl font-bold">${tier.price}</span>
                  <span className="text-muted-foreground ml-2">one-time</span>
                </div>

                <div className="mb-6">
                  <Badge variant="outline" className="text-lg px-3 py-1">
                    {tier.credits} test runs
                  </Badge>
                  <p className="text-sm text-muted-foreground mt-2">
                    ${(tier.price / tier.credits).toFixed(2)} per run
                  </p>
                </div>

                <ul className="space-y-3">
                  {tier.features.map((feature, index) => (
                    <li key={index} className="flex items-start gap-3">
                      <Check className="w-5 h-5 text-green-500 mt-0.5 shrink-0" />
                      <span className="text-sm">{feature}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>

              <CardFooter>
                <Button
                  onClick={() => handlePurchase(tier.tier)}
                  disabled={!stripeConfigured || purchasing !== null}
                  className="w-full"
                  variant={tier.tier === "pro" ? "default" : "outline"}
                  size="lg"
                >
                  {purchasing === tier.tier ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Processing...
                    </>
                  ) : (
                    `Buy ${tier.name}`
                  )}
                </Button>
              </CardFooter>
            </Card>
          ))}
        </div>

        {/* Footer note */}
        <div className="text-center mt-12 text-sm text-muted-foreground">
          <p>Secure payments powered by Stripe. Test runs never expire.</p>
          {!stripeConfigured && (
            <p className="mt-2 text-amber-500">
              Note: Payments are not yet configured. Please check back later.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
