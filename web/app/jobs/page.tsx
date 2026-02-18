import { withPageRequestTiming } from "@/app/lib/request-timing";
import { redirect } from "next/navigation";

function JobsRedirect() {
  redirect("/admin/jobs");
}

export default withPageRequestTiming("/jobs", JobsRedirect);
