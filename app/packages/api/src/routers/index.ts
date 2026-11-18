import type { RouterClient } from "@orpc/server"

import { publicProcedure } from "../index"

import { authRouter } from "./auth"
import { billingRouter } from "./billing"
import {
  bugReportRouter,
  notificationRouter,
  projectRouter,
  shareRouter,
} from "./bug-report"
import { captureKeyRouter } from "./capture-key"
import { inviteRouter } from "./invite"

export const appRouter = {
  healthCheck: publicProcedure.handler(() => {
    return "OK"
  }),
  auth: authRouter,
  billing: billingRouter,
  bugReport: bugReportRouter,
  captureKey: captureKeyRouter,
  project: projectRouter,
  notification: notificationRouter,
  share: shareRouter,
  invite: inviteRouter,
}
export type AppRouter = typeof appRouter
export type AppRouterClient = RouterClient<typeof appRouter>
