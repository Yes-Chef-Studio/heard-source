"use client"

import {
  BUG_REPORT_SORT_OPTIONS,
  BUG_REPORT_STATUS_OPTIONS,
  BUG_REPORT_VISIBILITY_OPTIONS,
  type BugReportSort,
  type BugReportStatus,
  type BugReportVisibility,
  OPEN_STATUS_VALUES,
} from "@crikket/shared/constants/bug-report"
import { CATEGORY_VALUES } from "@crikket/shared/constants/categories"
import { BROWSER_VALUES, DEVICE_VALUES } from "@crikket/shared/constants/device"
import {
  PRIORITY_OPTIONS,
  type Priority,
} from "@crikket/shared/constants/priorities"
import { useDebounce } from "@crikket/ui/hooks/use-debounce"
import {
  parseAsArrayOf,
  parseAsString,
  parseAsStringLiteral,
  useQueryStates,
} from "nuqs"
import { useEffect, useMemo, useState } from "react"

import {
  type CategoryFilter,
  countActiveFilters,
  type DashboardFilters,
  EMPTY_FILTERS,
  NO_CATEGORY_FILTER,
} from "../_components/bug-reports/filters"
import { toggleValue } from "../_components/bug-reports/utils"

const STATUS_VALUES = Object.values(
  BUG_REPORT_STATUS_OPTIONS
) satisfies readonly BugReportStatus[]

const PRIORITY_VALUES = Object.values(
  PRIORITY_OPTIONS
) satisfies readonly Priority[]

const VISIBILITY_VALUES = [
  BUG_REPORT_VISIBILITY_OPTIONS.private,
  BUG_REPORT_VISIBILITY_OPTIONS.public,
] as const satisfies readonly BugReportVisibility[]

const SORT_VALUES = [
  BUG_REPORT_SORT_OPTIONS.newest,
  BUG_REPORT_SORT_OPTIONS.oldest,
  BUG_REPORT_SORT_OPTIONS.updated,
  BUG_REPORT_SORT_OPTIONS.priorityHigh,
  BUG_REPORT_SORT_OPTIONS.priorityLow,
  BUG_REPORT_SORT_OPTIONS.status,
] as const satisfies readonly BugReportSort[]

const CATEGORY_FILTER_VALUES = [
  ...CATEGORY_VALUES,
  NO_CATEGORY_FILTER,
] as const satisfies readonly CategoryFilter[]

// Everything "Clear filters" resets. Search and sort are kept.
const CLEARED_FILTERS = {
  statuses: [...OPEN_STATUS_VALUES],
  priorities: EMPTY_FILTERS.priorities,
  categories: EMPTY_FILTERS.categories,
  visibilities: EMPTY_FILTERS.visibilities,
  pagePath: EMPTY_FILTERS.pagePath,
  browsers: EMPTY_FILTERS.browsers,
  devices: EMPTY_FILTERS.devices,
  reporter: EMPTY_FILTERS.reporter,
}

export function useBugReportsFilters() {
  const [
    {
      search,
      sort,
      statuses,
      priorities,
      categories,
      visibilities,
      pagePath,
      browsers,
      devices,
      reporter,
    },
    setFilterSearchQuery,
  ] = useQueryStates(
    {
      search: parseAsString
        .withOptions({ clearOnDefault: true })
        .withDefault(""),
      sort: parseAsStringLiteral(SORT_VALUES)
        .withOptions({ clearOnDefault: true })
        .withDefault(BUG_REPORT_SORT_OPTIONS.newest),
      // Closed and cancelled tickets are hidden until someone picks them in the Status filter.
      statuses: parseAsArrayOf(parseAsStringLiteral(STATUS_VALUES))
        .withOptions({ clearOnDefault: true })
        .withDefault([...OPEN_STATUS_VALUES]),
      priorities: parseAsArrayOf(parseAsStringLiteral(PRIORITY_VALUES))
        .withOptions({ clearOnDefault: true })
        .withDefault([]),
      visibilities: parseAsArrayOf(parseAsStringLiteral(VISIBILITY_VALUES))
        .withOptions({ clearOnDefault: true })
        .withDefault([]),
      categories: parseAsArrayOf(parseAsStringLiteral(CATEGORY_FILTER_VALUES))
        .withOptions({ clearOnDefault: true })
        .withDefault([]),
      // Old links may still carry ?site=...; it is no longer read, so it is ignored.
      pagePath: parseAsString
        .withOptions({ clearOnDefault: true })
        .withDefault(""),
      browsers: parseAsArrayOf(parseAsStringLiteral(BROWSER_VALUES))
        .withOptions({ clearOnDefault: true })
        .withDefault([]),
      devices: parseAsArrayOf(parseAsStringLiteral(DEVICE_VALUES))
        .withOptions({ clearOnDefault: true })
        .withDefault([]),
      reporter: parseAsString
        .withOptions({ clearOnDefault: true })
        .withDefault(""),
    },
    {
      history: "replace",
      shallow: false,
    }
  )
  const [searchInput, setSearchInput] = useState(search)
  const debouncedSearch = useDebounce(searchInput)

  useEffect(() => {
    setSearchInput(search)
  }, [search])

  useEffect(() => {
    if (debouncedSearch === search) {
      return
    }

    setFilterSearchQuery({ search: debouncedSearch }).catch(() => undefined)
  }, [debouncedSearch, search, setFilterSearchQuery])

  const filters = useMemo<DashboardFilters>(
    () => ({
      statuses,
      priorities,
      categories,
      visibilities,
      pagePath,
      browsers,
      devices,
      reporter,
    }),
    [
      statuses,
      priorities,
      categories,
      visibilities,
      pagePath,
      browsers,
      devices,
      reporter,
    ]
  )

  const hasFilters = useMemo(() => countActiveFilters(filters) > 0, [filters])

  return {
    searchValue: searchInput,
    setSearchValue: setSearchInput,
    debouncedSearch,
    sort,
    setSort: (value: BugReportSort) => {
      setFilterSearchQuery({ sort: value }).catch(() => undefined)
    },
    filters,
    clearFilters: () => {
      setFilterSearchQuery(CLEARED_FILTERS).catch(() => undefined)
    },
    resetFiltersAndSearch: () => {
      setSearchInput("")
      setFilterSearchQuery({ search: "", ...CLEARED_FILTERS }).catch(
        () => undefined
      )
    },
    hasActiveFilters: hasFilters || debouncedSearch.length > 0,
    // A list of statuses from the toolbar's Status select (see StatusSelect).
    setStatuses: (value: DashboardFilters["statuses"]) =>
      setFilterSearchQuery({ statuses: value }).catch(() => undefined),
    // One priority at a time from the toolbar; an empty value shows all.
    setPriority: (value: DashboardFilters["priorities"][number] | "") =>
      setFilterSearchQuery({
        priorities: value ? [value] : EMPTY_FILTERS.priorities,
      }).catch(() => undefined),
    // One category at a time from the toolbar; an empty value shows all.
    setCategory: (value: CategoryFilter | "") =>
      setFilterSearchQuery({
        categories: value ? [value] : EMPTY_FILTERS.categories,
      }).catch(() => undefined),
    setPagePath: (value: string) =>
      setFilterSearchQuery({ pagePath: value }).catch(() => undefined),
    toggleBrowser: (value: DashboardFilters["browsers"][number]) =>
      setFilterSearchQuery({
        browsers: toggleValue(filters.browsers, value),
      }).catch(() => undefined),
    toggleDevice: (value: DashboardFilters["devices"][number]) =>
      setFilterSearchQuery({
        devices: toggleValue(filters.devices, value),
      }).catch(() => undefined),
    setReporter: (value: string) =>
      setFilterSearchQuery({ reporter: value }).catch(() => undefined),
    toggleVisibility: (value: DashboardFilters["visibilities"][number]) =>
      setFilterSearchQuery({
        visibilities: toggleValue(filters.visibilities, value),
      }).catch(() => undefined),
  }
}
