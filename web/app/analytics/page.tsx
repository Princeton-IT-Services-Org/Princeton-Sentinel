import { withPageRequestTiming } from "@/app/lib/request-timing";
import { redirect } from "next/navigation";

function AnalyticsRedirect() {
  redirect("/admin/analytics");
}

export default withPageRequestTiming("/analytics", AnalyticsRedirect);
