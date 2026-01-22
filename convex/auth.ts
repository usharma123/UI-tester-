import WorkOS from "@auth/core/providers/workos";
import { convexAuth } from "@convex-dev/auth/server";
import { internal } from "./_generated/api";

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [
    WorkOS({
      clientId: process.env.AUTH_WORKOS_CLIENT_ID,
      clientSecret: process.env.AUTH_WORKOS_CLIENT_SECRET,
    }),
  ],
  callbacks: {
    async afterUserCreatedOrUpdated(ctx, { userId, existingUserId }) {
      if (!existingUserId) {
        // New user - initialize with 5 runs
        await ctx.runMutation(internal.users.initializeNewUser, { userId });
      }
    },
  },
});
