import type { Metadata } from "next"

import { BugReportsList } from "../_components/bug-reports/bug-reports-list"

export const metadata: Metadata = {
  title: "All feedback",
  description: "Every report across all projects",
}

export default function AllFeedbackPage() {
  return (
    <div className="flex flex-1 flex-col gap-8 pt-6">
      <div>
        <h1 className="font-bold text-3xl tracking-tight">All feedback</h1>
        <p className="mt-1 text-muted-foreground">
          Every report across all projects.
        </p>
      </div>
      <BugReportsList />
    </div>
  )
}
