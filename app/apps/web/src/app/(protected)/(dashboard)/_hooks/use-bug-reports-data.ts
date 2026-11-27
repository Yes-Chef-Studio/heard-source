"use client"

import type { BugReportSort } from "@crikket/shared/constants/bug-report"
import { useInfiniteQuery, useQuery } from "@tanstack/react-query"
import { useEffect, useMemo, useRef } from "react"

import { orpc } from "@/utils/orpc"
import type { DashboardFilters } from "../_components/bug-reports/filters"

export const PAGE_SIZE = 12

// bugReport.list input for these filters, without the page. Also used by the ticket page's
// previous/next arrows to load more of the same list (see lib/ticket-nav.ts).
export function buildListInput({
  search,
  sort,
  filters,
  projectId,
}: UseBugReportsDataInput) {
  return {
    search: search || undefined,
    sort,
    statuses: filters.statuses.length > 0 ? filters.statuses : undefined,
    priorities: filters.priorities.length > 0 ? filters.priorities : undefined,
    visibilities:
      filters.visibilities.length > 0 ? filters.visibilities : undefined,
    categories: filters.categories.length > 0 ? filters.categories : undefined,
    pagePath: filters.pagePath || undefined,
    browsers: filters.browsers.length > 0 ? filters.browsers : undefined,
    devices: filters.devices.length > 0 ? filters.devices : undefined,
    reporter: filters.reporter || undefined,
    projectId,
  }
}

interface UseBugReportsDataInput {
  search: string
  sort: BugReportSort
  filters: DashboardFilters
  projectId?: string
}

export function useBugReportsData({
  search,
  sort,
  filters,
  projectId,
}: UseBugReportsDataInput) {
  const loadMoreRef = useRef<HTMLDivElement | null>(null)
  const listInput = buildListInput({ search, sort, filters, projectId })

  const query = useInfiniteQuery(
    orpc.bugReport.list.infiniteOptions({
      initialPageParam: 1,
      input: (pageParam) => ({
        page: pageParam,
        perPage: PAGE_SIZE,
        ...listInput,
      }),
      getNextPageParam: (lastPage) =>
        lastPage.pagination.hasNextPage
          ? lastPage.pagination.page + 1
          : undefined,
    })
  )

  const statsQuery = useQuery(orpc.bugReport.getDashboardStats.queryOptions())

  const reports = useMemo(
    () => query.data?.pages.flatMap((page) => page.items) ?? [],
    [query.data]
  )

  useEffect(() => {
    const target = loadMoreRef.current
    if (!(target && query.hasNextPage) || query.isFetchingNextPage) {
      return
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const [entry] = entries
        if (entry?.isIntersecting) {
          query.fetchNextPage()
        }
      },
      { rootMargin: "300px 0px" }
    )

    observer.observe(target)

    return () => {
      observer.disconnect()
    }
  }, [query.fetchNextPage, query.hasNextPage, query.isFetchingNextPage])

  const refetchAll = async () => {
    await Promise.all([query.refetch(), statsQuery.refetch()])
  }

  return {
    loadMoreRef,
    listInput,
    hasNextPage: query.hasNextPage,
    reports,
    stats: statsQuery.data,
    refetchAll,
    isError: query.isError,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    errorMessage: query.error?.message,
    refetch: query.refetch,
  }
}
