"use client"

import type {
  BugReportSort,
  BugReportStatus,
  BugReportVisibility,
} from "@crikket/shared/constants/bug-report"
import type { Browser, Device } from "@crikket/shared/constants/device"
import { PRIORITIES, type Priority } from "@crikket/shared/constants/priorities"
import { Button } from "@crikket/ui/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
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
  FileText,
  Filter,
  Search,
  Shield,
  Tag,
  TriangleAlert,
  UserRound,
} from "lucide-react"
import { type ReactNode, useMemo } from "react"

import { ColorLabel } from "@/components/bug-reports/category-picker"
import { orpc } from "@/utils/orpc"

import {
  BROWSER_OPTIONS,
  CATEGORY_FILTER_OPTIONS,
  type CategoryFilter,
  countActiveFilters,
  type DashboardFilters,
  DEVICE_OPTIONS,
  formatBrowserLabel,
  formatCategoryLabel,
  formatDeviceLabel,
  formatPriorityLabel,
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
  // Scopes the page and person filters to one project.
  projectId?: string
  onSearchChange: (value: string) => void
  onPagePathChange: (value: string) => void
  onSortChange: (value: BugReportSort) => void
  onToggleStatus: (value: BugReportStatus) => void
  onPriorityChange: (value: Priority | "") => void
  onCategoryChange: (value: CategoryFilter | "") => void
  onToggleVisibility: (value: BugReportVisibility) => void
  onToggleBrowser: (value: Browser) => void
  onToggleDevice: (value: Device) => void
  onReporterChange: (value: string) => void
  onClearFilters: () => void
}

const ALL = "__all__"
const SELECT_WIDTH = "w-[160px]"

interface ReporterOption {
  key: string
  name: string | undefined
  email: string | undefined
  count: number
}

function reporterLabel(reporter: ReporterOption): string {
  return reporter.name ?? reporter.email ?? reporter.key
}

export function BugReportsToolbar({
  search,
  sort,
  filters,
  stats,
  projectId,
  onSearchChange,
  onPagePathChange,
  onSortChange,
  onToggleStatus,
  onPriorityChange,
  onCategoryChange,
  onToggleVisibility,
  onToggleBrowser,
  onToggleDevice,
  onReporterChange,
  onClearFilters,
}: BugReportsToolbarProps) {
  const activeFilters = countActiveFilters(filters)
  const scope = projectId ? { projectId } : undefined
  const sitesQuery = useQuery(
    orpc.bugReport.listSites.queryOptions({ input: scope })
  )
  const reportersQuery = useQuery(
    orpc.bugReport.listReporters.queryOptions({ input: scope })
  )
  const reporters: ReporterOption[] = reportersQuery.data ?? []
  const selectedReporter = reporters.find(
    (entry) => entry.key === filters.reporter
  )

  // Pages across every site in scope. The same path on two sites is one entry.
  const pages = useMemo(() => {
    const counts = new Map<string, number>()
    for (const site of sitesQuery.data ?? []) {
      for (const entry of site.pages) {
        counts.set(entry.page, (counts.get(entry.page) ?? 0) + entry.count)
      }
    }
    return Array.from(counts, ([page, count]) => ({ page, count })).sort(
      (a, b) => a.page.localeCompare(b.page)
    )
  }, [sitesQuery.data])

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div className="relative w-full xl:max-w-sm">
          <Search className="pointer-events-none absolute top-2.5 left-2.5 size-4 text-muted-foreground" />
          <Input
            className="pl-9"
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="Search title, description, URL or reviewer"
            value={search}
          />
        </div>

        <div className="flex flex-wrap items-center gap-2 xl:justify-end">
          <PageSelect
            onChange={onPagePathChange}
            pages={pages}
            value={filters.pagePath}
          />
          <CategorySelect
            onChange={onCategoryChange}
            value={filters.categories}
          />
          <PrioritySelect
            onChange={onPriorityChange}
            value={filters.priorities}
          />
          <SortSelect onChange={onSortChange} value={sort} />
          <FiltersMenu
            activeFilters={activeFilters}
            filters={filters}
            onReporterChange={onReporterChange}
            onToggleBrowser={onToggleBrowser}
            onToggleDevice={onToggleDevice}
            onToggleStatus={onToggleStatus}
            onToggleVisibility={onToggleVisibility}
            reporters={reporters}
          />

          {activeFilters > 0 ? (
            <Button onClick={onClearFilters} size="sm" variant="ghost">
              Clear filters
            </Button>
          ) : null}
        </div>
      </div>

      <SummaryRow
        filters={filters}
        reporterLabel={
          selectedReporter ? reporterLabel(selectedReporter) : filters.reporter
        }
        stats={stats}
      />
    </div>
  )
}

function PageSelect({
  pages,
  value,
  onChange,
}: {
  pages: Array<{ page: string; count: number }>
  value: string
  onChange: (value: string) => void
}) {
  return (
    <Select
      onValueChange={(next) =>
        onChange(!next || next === ALL ? "" : String(next))
      }
      value={value || ALL}
    >
      <SelectTrigger className={SELECT_WIDTH}>
        <SelectValue>{value || "All pages"}</SelectValue>
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
  )
}

function CategorySelect({
  value,
  onChange,
}: {
  value: CategoryFilter[]
  onChange: (value: CategoryFilter | "") => void
}) {
  const selected = CATEGORY_FILTER_OPTIONS.find(
    (option) => option.value === value[0]
  )
  return (
    <Select
      onValueChange={(next) => {
        const slug = String(next ?? "")
        onChange(slug === ALL ? "" : (slug as CategoryFilter | ""))
      }}
      value={value[0] ?? ALL}
    >
      <SelectTrigger className={SELECT_WIDTH}>
        <SelectValue>
          {selected ? (
            <ColorLabel color={selected.color} label={selected.label} />
          ) : (
            "All categories"
          )}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL}>All categories</SelectItem>
        {CATEGORY_FILTER_OPTIONS.map((category) => (
          <SelectItem key={category.value} value={category.value}>
            <ColorLabel color={category.color} label={category.label} />
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

function PrioritySelect({
  value,
  onChange,
}: {
  value: Priority[]
  onChange: (value: Priority | "") => void
}) {
  const selected = PRIORITIES.find((option) => option.value === value[0])
  return (
    <Select
      onValueChange={(next) => {
        const slug = String(next ?? "")
        onChange(slug === ALL ? "" : (slug as Priority | ""))
      }}
      value={value[0] ?? ALL}
    >
      <SelectTrigger className={SELECT_WIDTH}>
        <SelectValue>
          {selected ? (
            <ColorLabel color={selected.color} label={selected.label} />
          ) : (
            "All priorities"
          )}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL}>All priorities</SelectItem>
        {PRIORITY_FILTER_OPTIONS.map((priority) => (
          <SelectItem key={priority.value} value={priority.value}>
            <ColorLabel color={priority.color} label={priority.label} />
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

function SortSelect({
  value,
  onChange,
}: {
  value: BugReportSort
  onChange: (value: BugReportSort) => void
}) {
  const label =
    SORT_OPTIONS.find((option) => option.value === value)?.label ?? "Sort"
  return (
    <Select
      onValueChange={(next) => onChange(next as BugReportSort)}
      value={value}
    >
      <SelectTrigger className={SELECT_WIDTH}>
        <SelectValue>{label}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        {SORT_OPTIONS.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

function subMenuLabel(label: string, active: number): string {
  return active > 0 ? `${label} (${active})` : label
}

// Status and visibility inline; browser, device and person tucked into submenus so the bar and
// the menu both stay short.
function FiltersMenu({
  activeFilters,
  filters,
  reporters,
  onToggleStatus,
  onToggleVisibility,
  onToggleBrowser,
  onToggleDevice,
  onReporterChange,
}: {
  activeFilters: number
  filters: DashboardFilters
  reporters: ReporterOption[]
  onToggleStatus: (value: BugReportStatus) => void
  onToggleVisibility: (value: BugReportVisibility) => void
  onToggleBrowser: (value: Browser) => void
  onToggleDevice: (value: Device) => void
  onReporterChange: (value: string) => void
}) {
  return (
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
        <DropdownMenuSeparator />
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            {subMenuLabel("Browser", filters.browsers.length)}
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="w-44">
            {BROWSER_OPTIONS.map((browser) => (
              <DropdownMenuCheckboxItem
                checked={filters.browsers.includes(browser.value)}
                key={browser.value}
                onCheckedChange={() => onToggleBrowser(browser.value)}
              >
                {browser.label}
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            {subMenuLabel("Device", filters.devices.length)}
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="w-44">
            {DEVICE_OPTIONS.map((device) => (
              <DropdownMenuCheckboxItem
                checked={filters.devices.includes(device.value)}
                key={device.value}
                onCheckedChange={() => onToggleDevice(device.value)}
              >
                {device.label}
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            {subMenuLabel("Person", filters.reporter ? 1 : 0)}
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="max-h-80 w-64 overflow-y-auto">
            <DropdownMenuRadioGroup
              onValueChange={(value) =>
                onReporterChange(value === ALL ? "" : String(value))
              }
              value={filters.reporter || ALL}
            >
              <DropdownMenuRadioItem value={ALL}>
                Everyone
              </DropdownMenuRadioItem>
              {reporters.map((reporter) => (
                <DropdownMenuRadioItem
                  key={reporter.key}
                  title={reporter.email ?? reporter.name}
                  value={reporter.key}
                >
                  <span className="truncate">
                    {reporterLabel(reporter)} ({reporter.count})
                  </span>
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function SummaryRow({
  filters,
  reporterLabel: selectedReporterLabel,
  stats,
}: {
  filters: DashboardFilters
  reporterLabel: string
  stats?: BugReportStats
}) {
  if (!stats && countActiveFilters(filters) === 0) return null
  return (
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
      {filters.pagePath ? (
        <Pill>
          <FileText className="mr-1 size-3" />
          {filters.pagePath}
        </Pill>
      ) : null}
      {filters.categories.map((category) => (
        <Pill key={category}>{formatCategoryLabel(category)}</Pill>
      ))}
      {filters.statuses.map((status) => (
        <Pill key={status}>{formatStatusLabel(status)}</Pill>
      ))}
      {filters.priorities.map((priority) => (
        <Pill key={priority}>{formatPriorityLabel(priority)}</Pill>
      ))}
      {filters.visibilities.map((visibility) => (
        <Pill key={visibility}>{formatVisibilityLabel(visibility)}</Pill>
      ))}
      {filters.browsers.map((browser) => (
        <Pill key={browser}>{formatBrowserLabel(browser)}</Pill>
      ))}
      {filters.devices.map((device) => (
        <Pill key={device}>{formatDeviceLabel(device)}</Pill>
      ))}
      {filters.reporter ? (
        <Pill>
          <UserRound className="mr-1 size-3" />
          {selectedReporterLabel}
        </Pill>
      ) : null}
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
