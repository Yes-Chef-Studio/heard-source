"use client"

import { env } from "@crikket/env/web"
import { siteConfig } from "@crikket/shared/config/site"
import { Button } from "@crikket/ui/components/ui/button"
import { cn } from "@crikket/ui/lib/utils"
import { Loader2, MessageSquarePlus } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"

// Heard reports on itself: this opens the Heard widget with the key of the internal "Heard"
// project (NEXT_PUBLIC_CRIKKET_KEY), so bugs and ideas land in the dashboard like any other ticket.
// The widget is loaded on the first click and never shows its side tab here.
const OPEN_TIMEOUT_MS = 4000

async function openFeedbackWidget(key: string) {
  const capture = await import("@crikket-io/capture")
  if (!capture.isInitialized()) {
    capture.init({
      key,
      host: env.NEXT_PUBLIC_SERVER_URL,
      autoMount: false,
      hideLauncher: true,
    })
  }
  capture.open()
  // The widget fails closed and silently when its site check is refused (for example a privacy
  // extension blocking the request). Say so instead of leaving the click with no response.
  await new Promise((resolve) => setTimeout(resolve, OPEN_TIMEOUT_MS))
  if (!document.querySelector("[data-heard-widget]")) {
    throw new Error("Feedback widget didn't open")
  }
}

export function HeardFeedbackButton({ className }: { className?: string }) {
  const key = env.NEXT_PUBLIC_CRIKKET_KEY
  const [isOpening, setIsOpening] = useState(false)

  if (!key) {
    return null
  }

  return (
    <Button
      className={className}
      disabled={isOpening}
      onClick={() => {
        setIsOpening(true)
        openFeedbackWidget(key)
          .catch(() => {
            toast.error(
              "The feedback form didn't open. If you use an ad blocker or privacy shield, allow it for this site and try again."
            )
          })
          .finally(() => setIsOpening(false))
      }}
      size="sm"
      type="button"
      variant="outline"
    >
      {isOpening ? (
        <Loader2 className="size-4 animate-spin" />
      ) : (
        <MessageSquarePlus className="size-4" />
      )}
      Report a bug or suggest an improvement
    </Button>
  )
}

export function HeardFeedbackFooter({ className }: { className?: string }) {
  if (!env.NEXT_PUBLIC_CRIKKET_KEY) {
    return null
  }

  return (
    <footer
      className={cn(
        "flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between",
        className
      )}
    >
      <p className="text-muted-foreground text-xs">
        Something off with {siteConfig.name}, or an idea to make it better?
      </p>
      <HeardFeedbackButton />
    </footer>
  )
}
