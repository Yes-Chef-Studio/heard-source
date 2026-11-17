import type { Metadata } from "next"

import { NotificationsList } from "../_components/projects/notifications-list"

export const metadata: Metadata = { title: "Notifications" }

export default function NotificationsPage() {
  return (
    <div className="flex flex-1 flex-col gap-4 pt-4">
      <div>
        <h1 className="font-bold text-3xl tracking-tight">Notifications</h1>
        <p className="mt-1 text-muted-foreground">
          New feedback and client comments.
        </p>
      </div>
      <NotificationsList />
    </div>
  )
}
