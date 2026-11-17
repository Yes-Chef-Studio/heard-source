"use client"

import type { authClient } from "@crikket/auth/client"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@crikket/ui/components/ui/sidebar"
import { useQuery } from "@tanstack/react-query"
import {
  Bell,
  Building2,
  CreditCard,
  FolderOpen,
  Inbox,
  KeyRound,
  UserRound,
} from "lucide-react"
import type { Route } from "next"
import Link from "next/link"
import { usePathname } from "next/navigation"
import type * as React from "react"
import { TeamSwitcher } from "@/components/team-switcher"
import { UserNav } from "@/components/user-nav"
import { orpc } from "@/utils/orpc"

type Organization = typeof authClient.$Infer.Organization

interface AppSidebarProps extends React.ComponentProps<typeof Sidebar> {
  user: typeof authClient.$Infer.Session.user
  organizations: Organization[]
  activeOrganization?: Organization
}

const navPrimary = [
  {
    title: "Projects",
    url: "/" as const,
    isActive: (path: string) => path === "/" || path.startsWith("/projects"),
    icon: FolderOpen,
  },
  {
    title: "All feedback",
    url: "/feedback" as const,
    isActive: (path: string) => path.startsWith("/feedback"),
    icon: Inbox,
  },
  {
    title: "Notifications",
    url: "/notifications" as const,
    isActive: (path: string) => path.startsWith("/notifications"),
    icon: Bell,
    showUnread: true,
  },
]

// Unread notifications, refreshed every 30 s and when the window regains focus.
function UnreadBadge() {
  const query = useQuery({
    ...orpc.notification.unreadCount.queryOptions(),
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
  })
  const count = query.data?.count ?? 0
  if (count === 0) return null
  return (
    <SidebarMenuBadge aria-label={`${count} unread`}>
      {count > 99 ? "99+" : count}
    </SidebarMenuBadge>
  )
}

const navSettings = [
  {
    title: "User",
    url: "/settings/user" as const,
    icon: UserRound,
  },
  {
    title: "Organization",
    url: "/settings/organization" as const,
    icon: Building2,
  },
  {
    title: "Projects & keys",
    url: "/settings/keys" as const,
    icon: KeyRound,
  },
  {
    title: "Billing",
    url: "/settings/billing" as const,
    icon: CreditCard,
  },
] as const

export function AppSidebar({
  user,
  organizations,
  activeOrganization,
  ...props
}: AppSidebarProps) {
  const pathname = usePathname()

  return (
    <Sidebar collapsible="icon" variant="inset" {...props}>
      <SidebarHeader>
        <TeamSwitcher
          activeOrganization={activeOrganization}
          organizations={organizations}
          userId={user.id}
        />
      </SidebarHeader>
      <SidebarContent className="gap-0">
        <SidebarGroup>
          <SidebarGroupLabel>Platform</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {navPrimary.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton
                    isActive={item.isActive(pathname)}
                    render={(props) => (
                      <Link href={item.url as Route} {...props} />
                    )}
                  >
                    <item.icon />
                    <span>{item.title}</span>
                  </SidebarMenuButton>
                  {"showUnread" in item ? <UnreadBadge /> : null}
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        <SidebarGroup>
          <SidebarGroupLabel>Settings</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {navSettings.map((item) => (
                <SidebarMenuItem key={item.url}>
                  <SidebarMenuButton
                    isActive={pathname.startsWith(item.url)}
                    render={(props) => (
                      <Link href={item.url as Route} {...props} />
                    )}
                  >
                    <item.icon />
                    <span>{item.title}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <UserNav user={user} />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}
