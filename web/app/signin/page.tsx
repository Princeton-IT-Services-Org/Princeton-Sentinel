import { redirect } from "next/navigation";

import { sanitizeCallbackUrl } from "@/app/lib/callback-url";

type Props = {
  searchParams?: Promise<{ callbackUrl?: string | string[]; error?: string | string[] }>;
};

export const dynamic = "force-dynamic";

export default async function SignInPage({ searchParams }: Props) {
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const callbackUrl = sanitizeCallbackUrl(resolvedSearchParams?.callbackUrl);
  const error = typeof resolvedSearchParams?.error === "string" ? resolvedSearchParams.error : undefined;
  const params = new URLSearchParams({ callbackUrl });
  if (error) {
    params.set("error", error);
  }

  redirect(`/signin/account?${params.toString()}`);
}
