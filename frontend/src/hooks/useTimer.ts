import { useEffect } from "react";
import { useAppStore } from "@/store/useAppStore";

export function useTimer() {
  const { status, tick } = useAppStore();

  useEffect(() => {
    if (status !== "running") return;

    const interval = setInterval(() => {
      tick();
    }, 1000);

    return () => clearInterval(interval);
  }, [status, tick]);
}
