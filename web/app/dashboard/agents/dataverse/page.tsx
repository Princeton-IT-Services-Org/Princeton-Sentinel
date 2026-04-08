import { redirect } from "next/navigation";

export default function LegacyDataversePage() {
  redirect("/dashboard/agents/agent-access-control");
}
