"use client"

import type {
  BugReportSort,
  BugReportStatus,
  BugReportVisibility,
} from "@crikket/shared/constants/bug-report"
import { PRIORITIES, type Priority } from "@crikket/shared/constants/priorities"
import { Button } from "@crikket/ui/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@crikket/ui/components/ui/dropdown-menu"
import { Input } from "@crikket/ui/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@crikket/ui/components/ui/select"
import { useQuery } from "@tanstack/react-query"
import {
  Filter,
  Globe,
  Search,
  Shield,
  Tag,
  TriangleAlert,
  UserRound,
} from "lucide-react"
import type { ReactNode } from "react"

import { orpc } from "@/utils/orpc"

import {
  type DashboardFilters,
  formatPriorityLabel,
  formatSiteLabel,
  formatStatusLabel,
  formatVisibilityLabel,
  PRIORITY_FILTER_OPTIONS,
  SORT_OPTIONS,
  STATUS_OPTIONS,
  VISIBILITY_OPTIONS,
} from "./filters"
import type { BugReportStats } from "./types"

interface BugReportsToolbarProps {
  search: string
  sort: BugReportSort
  filters: DashboardFilters
  stats?: BugReportStats
  // Scopes the site/page filter to one project.
  projectId?: string
  onSearchChange: (value: string) => void
  onSiteChange: (value: string) => void
  onPagePathChange: (value: string) => void
  onSortChange: (value: BugReportSort) => void
  onToggleStatus: (value: BugReportStatus) => void
  onPriorityChange: (value: Priority | "") => void
  onToggleVisibility: (value: BugReportVisibility) => void
  onClearFilters: () => void
}

const ALL = "__all__"

function countActiveFilters(filters: DashboardFilters): number {
  return (
    filters.statuses.length +
    filters.priorities.length +
    filters.visibilities.length +
    (filters.site ? 1 : 0) +
    (filters.pagePath ? 1 : 0)
  )
}

export function BugReportsToolbar({
  search,
  sort,
  filters,
  stats,
  projectId,
  onSearchChange,
  onSiteChange,
  onPagePathChange,
  onSortChange,
  onToggleStatus,
  onPriorityChange,
  onToggleVisibility,
  onClearFilters,
}: BugReportsToolbarProps) {
  const activeFilters = countActiveFilters(filters)
  const sitesQuery = useQuery(
    orpc.bugReport.listSites.queryOptions({
      input: projectId ? { projectId } : undefined,
    })
  )
  const sites = sitesQuery.data ?? []
  const selectedSite = sites.find((entry) => entry.site === filters.site)
  const pages = selectedSite?.pages ?? []
  const selectedSortLabel =
    SORT_OPTIONS.find((option) => option.value === sort)?.label ?? "Sort"

  return (
    <div className="space-y-3 rounded-lg border bg-card p-3">
      <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
        <div className="relative w-full lg:max-w-sm">
          <Search className="pointer-events-none absolute top-2.5 left-2.5 size-4 text-muted-foreground" />
          <Input
            className="pl-9"
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="Search title, description, URL or reviewer"
            value={search}
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Select
            onValueChange={(value) =>
              onSiteChange(!value || value === ALL ? "" : String(value))
            }
            value={filters.site || ALL}
          >
            <SelectTrigger className="w-[220px]">
              <SelectValue>
                {filters.site ? formatSiteLabel(filters.site) : "All sites"}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All sites</SelectItem>
              {sites.map((entry) => (
                <SelectItem key={entry.site} value={entry.site}>
                  {formatSiteLabel(entry.site)} ({entry.count})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            disabled={!filters.site}
            onValueChange={(value) =>
              onPagePathChange(!value || value === ALL ? "" : String(value))
            }
            value={filters.pagePath || ALL}
          >
            <SelectTrigger className="w-[200px]">
              <SelectValue>{filters.pagePath || "All pages"}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All pages</SelectItem>
              {pages.map((entry) => (
                <SelectItem key={entry.page} value={entry.page}>
                  {entry.page} ({entry.count})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            onValueChange={(value) => {
              const next = String(value ?? "")
              onPriorityChange(next === ALL ? "" : (next as Priority | ""))
            }}
            value={filters.priorities[0] ?? ALL}
          >
            <SelectTrigger className="w-[200px]">
              <SelectValue>
                {filters.priorities.length > 0
                  ? filters.priorities
                      .map(
                        (value) =>
                          PRIORITIES.find((option) => option.value === value)
                            ?.label ?? value
                      )
                      .join(", ")
                  : "All priorities"}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All priorities</SelectItem>
              {PRIORITY_FILTER_OPTIONS.map((priority) => (
                <SelectItem key={priority.value} value={priority.value}>
                  {priority.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            onValueChange={(value) => onSortChange(value as BugReportSort)}
            value={sort}
          >
            <SelectTrigger className="w-[200px]">
              <SelectValue>{selectedSortLabel}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {SORT_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button size="sm" variant="outline">
                  <Filter className="size-4" />
                  Filters
                  {activeFilters > 0 ? ` (${activeFilters})` : ""}
                </Button>
              }
            />
            <DropdownMenuContent align="end" className="w-64">
              <DropdownMenuGroup>
                <DropdownMenuLabel>Status</DropdownMenuLabel>
                {STATUS_OPTIONS.map((status) => (
                  <DropdownMenuCheckboxItem
                    checked={filters.statuses.includes(status.value)}
                    key={status.value}
                    onCheckedChange={() => onToggleStatus(status.value)}
                  >
                    {status.label}
                  </DropdownMenuCheckboxItem>
                ))}
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              <DropdownMenuGroup>
                <DropdownMenuLabel>Visibility</DropdownMenuLabel>
                {VISIBILITY_OPTIONS.map((visibility) => (
                  <DropdownMenuCheckboxItem
                    checked={filters.visibilities.includes(visibility.value)}
                    key={visibility.value}
                    onCheckedChange={() => onToggleVisibility(visibility.value)}
                  >
                    {visibility.label}
                  </DropdownMenuCheckboxItem>
                ))}
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>

          <Button
            disabled={activeFilters === 0}
            onClick={onClearFilters}
            size="sm"
            variant="ghost"
          >
            Clear filters
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {stats ? (
          <>
            <StatChip
              icon={<TriangleAlert className="size-3.5" />}
              label="Open"
              value={stats.open}
            />
            <StatChip
              icon={<Shield className="size-3.5" />}
              label="Untriaged"
              value={stats.untriaged}
            />
            <StatChip
              icon={<UserRound className="size-3.5" />}
              label="Mine"
              value={stats.mine}
            />
            <StatChip
              icon={<Tag className="size-3.5" />}
              label="Total"
              value={stats.total}
            />
          </>
        ) : null}
        {filters.site ? (
          <Pill>
            <Globe className="mr-1 size-3" />
            {formatSiteLabel(filters.site)}
            {filters.pagePath ? filters.pagePath : ""}
          </Pill>
        ) : null}
        {filters.statuses.map((status) => (
          <Pill key={status}>{formatStatusLabel(status)}</Pill>
        ))}
        {filters.priorities.map((priority) => (
          <Pill key={priority}>{formatPriorityLabel(priority)}</Pill>
        ))}
        {filters.visibilities.map((visibility) => (
          <Pill key={visibility}>{formatVisibilityLabel(visibility)}</Pill>
        ))}
      </div>
    </div>
  )
}

function StatChip({
  icon,
  label,
  value,
}: {
  icon: ReactNode
  label: string
  value: number
}) {
  return (
    <span className="inline-flex items-center gap-1 rounded-md border bg-background px-2 py-1 font-medium text-xs">
      {icon}
      {label}: {value}
    </span>
  )
}

function Pill({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-md border bg-muted px-2 py-1 text-xs">
      {children}
    </span>
  )
}
