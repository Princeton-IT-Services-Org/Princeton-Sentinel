import { withPageRequestTiming } from "@/app/lib/request-timing";
import { requireAdmin } from "@/app/lib/auth";
import RunsSummaryTable from "@/app/admin/runs/RunsSummaryTable";
import { getLatestRunsByType } from "@/app/admin/runs/run-data";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

async function RunsPage() {
  await requireAdmin();

  const runs = await getLatestRunsByType();

  return (
    <Card>
      <CardHeader>
        <CardTitle>Latest Job Runs by Type</CardTitle>
      </CardHeader>
      <CardContent>
        <RunsSummaryTable initialRuns={runs} />
      </CardContent>
    </Card>
  );
}

export default withPageRequestTiming("/admin/runs", RunsPage);
