import { createAuthClient } from "better-auth/react";

// Use the same origin as the page is being served from
// This allows it to work with both localhost and ngrok
const baseURL =
  typeof window !== "undefined"
    ? window.location.origin
    : process.env.NEXT_PUBLIC_BETTER_AUTH_URL || "http://localhost:3000";

export const authClient = createAuthClient({
  baseURL,
});

export const { signIn, signUp, signOut, useSession } = authClient;
