import { withPageRequestTiming } from "@/app/lib/request-timing";
import { redirect } from "next/navigation";

function RunsRedirect() {
  redirect("/admin/runs");
}

export default withPageRequestTiming("/runs", RunsRedirect);
