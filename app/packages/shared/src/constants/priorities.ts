export const PRIORITY_OPTIONS = {
  high: "high",
  normal: "normal",
  low: "low",
} as const

export type Priority = (typeof PRIORITY_OPTIONS)[keyof typeof PRIORITY_OPTIONS]

export const DEFAULT_PRIORITY: Priority = PRIORITY_OPTIONS.normal

// Highest first. Labels are what reviewers and the team see.
export const PRIORITIES: ReadonlyArray<{
  value: Priority
  label: string
  description: string
  color: string
}> = [
  {
    value: "high",
    label: "High",
    description: "Launch blocking",
    color: "#e5484d",
  },
  {
    value: "normal",
    label: "Normal",
    description: "Nice to fix",
    color: "#e0a019",
  },
  {
    value: "low",
    label: "Low",
    description: "Post-launch backlog",
    color: "#7d93b2",
  },
]

export function getPriorityColor(priority: string): string {
  return PRIORITIES.find((item) => item.value === priority)?.color ?? "#9ca3af"
}

export function getPriorityLabel(priority: string): string {
  const option = PRIORITIES.find((item) => item.value === priority)
  return option ? `${option.label}: ${option.description}` : priority
}
