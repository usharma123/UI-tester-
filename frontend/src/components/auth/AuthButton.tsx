import { useClerk, useUser } from "@clerk/clerk-react";
import { useConvexAuth, useMutation } from "convex/react";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { LogIn, LogOut, Loader2 } from "lucide-react";
import { api } from "convex/_generated/api";

export function AuthButton() {
  const { isLoading, isAuthenticated } = useConvexAuth();
  const { user } = useUser();
  const { openSignIn, signOut } = useClerk();
  const getOrCreateUser = useMutation(api.users.getOrCreateUser);

  useEffect(() => {
    if (isAuthenticated && user) {
      getOrCreateUser().catch(console.error);
    }
  }, [isAuthenticated, user, getOrCreateUser]);

  if (isLoading) {
    return (
      <Button variant="outline" size="sm" disabled>
        <Loader2 className="w-4 h-4 animate-spin" />
      </Button>
    );
  }

  if (isAuthenticated) {
    return (
      <Button
        variant="outline"
        size="sm"
        onClick={() => signOut()}
        className="gap-2"
      >
        <LogOut className="w-4 h-4" />
        Sign Out
      </Button>
    );
  }

  return (
    <Button
      variant="default"
      size="sm"
      onClick={() => openSignIn()}
      className="gap-2"
    >
      <LogIn className="w-4 h-4" />
      Sign In
    </Button>
  );
}
