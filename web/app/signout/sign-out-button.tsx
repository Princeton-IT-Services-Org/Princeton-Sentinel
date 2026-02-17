"use client";

import { signOut } from "next-auth/react";

import { Button } from "@/components/ui/button";

export function SignOutButton({ callbackUrl = "/signin/account" }: { callbackUrl?: string }) {
  return (
    <Button
      type="button"
      onClick={() => {
        void signOut({ callbackUrl });
      }}
    >
      Sign out
    </Button>
  );
}
