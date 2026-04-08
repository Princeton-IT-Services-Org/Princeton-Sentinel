import { redirectIfFeatureDisabled } from "@/app/lib/feature-flags";
import { withPageRequestTiming } from "@/app/lib/request-timing";
import AgentAccessControlClient from "./agent-access-control-client";

async function AgentAccessControlPage() {
  await redirectIfFeatureDisabled("agents_dashboard");
  return <AgentAccessControlClient />;
}

export default withPageRequestTiming("/dashboard/agents/agent-access-control", AgentAccessControlPage);
