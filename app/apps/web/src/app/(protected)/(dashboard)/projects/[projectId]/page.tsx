import type { Metadata } from "next"

import { BugReportsList } from "../../_components/bug-reports/bug-reports-list"
import { ProjectHeader } from "../../_components/projects/project-header"

export const metadata: Metadata = { title: "Project" }

export default async function ProjectPage({
  params,
}: {
  params: Promise<{ projectId: string }>
}) {
  const { projectId } = await params
  return (
    <div className="flex flex-1 flex-col gap-4 pt-4">
      <ProjectHeader projectId={projectId} />
      <BugReportsList projectId={projectId} />
    </div>
  )
}
