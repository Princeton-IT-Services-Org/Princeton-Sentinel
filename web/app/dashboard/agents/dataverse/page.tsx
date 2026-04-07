import { redirectIfFeatureDisabled } from "@/app/lib/feature-flags";
import { withPageRequestTiming } from "@/app/lib/request-timing";
import DataverseTableClient from "./dataverse-table-client";

async function DataverseTablePage() {
  await redirectIfFeatureDisabled("agents_dashboard");
  return <DataverseTableClient />;
}

export default withPageRequestTiming("/dashboard/agents/dataverse", DataverseTablePage);
