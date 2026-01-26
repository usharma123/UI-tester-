import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";

interface ScoreGaugeProps {
  score: number;
  summary: string;
}

export function ScoreGauge({ score, summary }: ScoreGaugeProps) {
  const [displayScore, setDisplayScore] = useState(0);

  // Animate score number
  useEffect(() => {
    const duration = 1500;
    const startTime = performance.now();

    const animate = (currentTime: number) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      // Ease out cubic
      const easeOut = 1 - Math.pow(1 - progress, 3);
      setDisplayScore(Math.round(score * easeOut));

      if (progress < 1) {
        requestAnimationFrame(animate);
      }
    };

    requestAnimationFrame(animate);
  }, [score]);

  // Calculate stroke dash offset (circumference = 2 * PI * r = 2 * PI * 80 = 502.65)
  const circumference = 502.65;
  const offset = circumference - (score / 100) * circumference;

  const colorClass =
    score >= 80
      ? "text-emerald-500"
      : score >= 50
        ? "text-amber-500"
        : "text-red-500";

  const bgGlow =
    score >= 80
      ? "from-emerald-500/10"
      : score >= 50
        ? "from-amber-500/10"
        : "from-red-500/10";

  const TrendIcon = score >= 80 ? TrendingUp : score >= 50 ? Minus : TrendingDown;

  const gradeLabel =
    score >= 90 ? "Excellent" :
    score >= 80 ? "Good" :
    score >= 70 ? "Fair" :
    score >= 50 ? "Needs Work" :
    "Poor";

  return (
    <div className="flex items-center gap-10 p-10 bg-card border border-border rounded-2xl relative overflow-hidden">
      {/* Background accent */}
      <div
        className={cn(
          "absolute top-0 left-0 right-0 h-1 opacity-80",
          score >= 80
            ? "bg-gradient-to-r from-transparent via-emerald-500 to-transparent"
            : score >= 50
              ? "bg-gradient-to-r from-transparent via-amber-500 to-transparent"
              : "bg-gradient-to-r from-transparent via-red-500 to-transparent"
        )}
      />
      <div className={cn(
        "absolute top-0 right-0 w-64 h-64 bg-gradient-radial to-transparent opacity-40 rounded-full -translate-y-1/2 translate-x-1/4",
        bgGlow
      )} />

      {/* Score gauge */}
      <div className="relative w-48 h-48 shrink-0">
        <svg className="w-full h-full -rotate-90" viewBox="0 0 180 180">
          {/* Gradient definitions */}
          <defs>
            <linearGradient
              id="scoreGradient"
              x1="0%"
              y1="0%"
              x2="100%"
              y2="100%"
            >
              <stop
                offset="0%"
                className={cn(
                  score >= 80
                    ? "text-emerald-300"
                    : score >= 50
                      ? "text-amber-300"
                      : "text-red-300"
                )}
                stopColor="currentColor"
              />
              <stop
                offset="100%"
                className={cn(
                  score >= 80
                    ? "text-emerald-500"
                    : score >= 50
                      ? "text-amber-500"
                      : "text-red-500"
                )}
                stopColor="currentColor"
              />
            </linearGradient>
          </defs>

          {/* Background circle */}
          <circle
            cx="90"
            cy="90"
            r="80"
            fill="none"
            stroke="currentColor"
            strokeWidth="12"
            className="text-muted"
          />

          {/* Score circle */}
          <circle
            cx="90"
            cy="90"
            r="80"
            fill="none"
            stroke="url(#scoreGradient)"
            strokeWidth="12"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            className="transition-all duration-[1.5s] ease-out"
            style={{
              filter: `drop-shadow(0 0 12px ${
                score >= 80
                  ? "rgba(52, 211, 153, 0.4)"
                  : score >= 50
                    ? "rgba(251, 191, 36, 0.4)"
                    : "rgba(248, 113, 113, 0.4)"
              })`,
            }}
          />
        </svg>

        {/* Center content */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className={cn("text-5xl font-bold tabular-nums", colorClass)}>
            {displayScore}
          </span>
          <span className="text-sm text-muted-foreground mt-1">/100</span>
        </div>
      </div>

      {/* Summary */}
      <div className="flex-1 space-y-4">
        <div className="flex items-center gap-3">
          <div className={cn(
            "flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-semibold",
            score >= 80
              ? "bg-emerald-500/10 text-emerald-600"
              : score >= 50
                ? "bg-amber-500/10 text-amber-600"
                : "bg-red-500/10 text-red-600"
          )}>
            <TrendIcon className="w-4 h-4" />
            {gradeLabel}
          </div>
        </div>
        <p className="text-base text-muted-foreground leading-relaxed">
          {summary}
        </p>
      </div>
    </div>
  );
}
