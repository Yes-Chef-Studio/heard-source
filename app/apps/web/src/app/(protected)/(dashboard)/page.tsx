import type { Metadata } from "next"

import { ProjectsGrid } from "./_components/projects/projects-grid"

export const metadata: Metadata = {
  title: "Projects",
  description: "Client feedback, one folder per project",
}

export default function ProjectsPage() {
  return (
    <div className="flex flex-1 flex-col gap-4 pt-4">
      <ProjectsGrid />
    </div>
  )
}
