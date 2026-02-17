"use client";

import { signIn } from "next-auth/react";
import { useSearchParams } from "next/navigation";

import { Button } from "@/components/ui/button";

export function AccountSignInButtons({
  callbackUrl,
  initialError,
}: {
  callbackUrl: string;
  initialError?: string;
}) {
  const searchParams = useSearchParams();
  const error = searchParams?.get("error") ?? initialError;

  return (
    <div className="flex flex-col gap-3">
      {error ? (
        <p className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          Sign-in failed ({error}). Check your Entra redirect URI and `ENTRA_*` / `NEXTAUTH_*` env vars.
        </p>
      ) : null}
      <Button
        className="w-full"
        type="button"
        onClick={() => {
          void signIn("azure-ad", { callbackUrl });
        }}
      >
        Continue
      </Button>
      <Button
        className="w-full"
        variant="outline"
        type="button"
        onClick={() => {
          void signIn("azure-ad", { callbackUrl }, { prompt: "select_account" });
        }}
      >
        Use different account
      </Button>
    </div>
  );
}
