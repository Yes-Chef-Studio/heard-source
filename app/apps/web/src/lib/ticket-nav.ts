// Previous/next arrows on a ticket follow the list it was opened from (same filters and sort).
// The list saves its order here when a ticket is clicked; the ticket page reads it. Per tab, and
// only a convenience: without it (a pasted link, private browsing) the arrows just don't show.

const STORAGE_KEY = "heard:ticket-nav"

export interface DashboardTicketList {
  kind: "dashboard"
  ids: string[]
  // bugReport.list input without page/perPage, to load the next page from the ticket page.
  input: Record<string, unknown>
  pageSize: number
  hasMore: boolean
}

export interface ClientTicketList {
  kind: "client"
  token: string
  ids: string[]
}

export type TicketList = DashboardTicketList | ClientTicketList

export function saveTicketList(list: TicketList): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(list))
  } catch {
    // Storage blocked or full: the arrows just won't show.
  }
}

export function readTicketList(): TicketList | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as TicketList
    return Array.isArray(parsed?.ids) ? parsed : null
  } catch {
    return null
  }
}

// Saves the list when a ticket link inside it is clicked (capture phase, before navigation).
export function saveOnTicketClick(
  event: { target: EventTarget | null },
  list: () => TicketList
): void {
  const target = event.target
  if (target instanceof Element && target.closest("a[href]")) {
    saveTicketList(list())
  }
}
