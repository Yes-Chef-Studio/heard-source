import { env } from "@crikket/env/web"
import { initPostHog } from "@crikket/shared/lib/posthog"

// Heard: the self-feedback widget (NEXT_PUBLIC_CRIKKET_KEY) is opened from a footer button and
// loaded on demand, see src/components/heard-feedback.tsx.
initPostHog({
  key: env.NEXT_PUBLIC_POSTHOG_KEY,
  host: env.NEXT_PUBLIC_POSTHOG_HOST,
})
