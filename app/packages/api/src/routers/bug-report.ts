import {
  addBugReportComment,
  deleteBugReportComment,
  listBugReportComments,
} from "@crikket/bug-reports/procedures/comments"
import {
  deleteBugReport,
  deleteBugReportsBulk,
} from "@crikket/bug-reports/procedures/delete-bug-reports"
import { getBugReportById } from "@crikket/bug-reports/procedures/get-bug-report"
import {
  getBugReportDebuggerEvents,
  getBugReportNetworkRequestPayload,
  getBugReportNetworkRequests,
} from "@crikket/bug-reports/procedures/get-bug-report-debugger"
import {
  getBugReportDashboardStats,
  listBugReportReporters,
  listBugReportSites,
  listBugReports,
} from "@crikket/bug-reports/procedures/list-bug-reports"
import {
  getUnreadNotificationCount,
  listNotifications,
  markNotificationsRead,
} from "@crikket/bug-reports/procedures/notifications"
import {
  disableProjectShareLink,
  getProject,
  listProjects,
  regenerateProjectShareLink,
  setProjectWidgetColor,
} from "@crikket/bug-reports/procedures/projects"
import {
  addSharedComment,
  getSharedProject,
  getSharedReport,
  listSharedReports,
} from "@crikket/bug-reports/procedures/share"
import {
  updateBugReport,
  updateBugReportsBulk,
  updateBugReportVisibility,
} from "@crikket/bug-reports/procedures/update-bug-reports"
import {
  createBugReportUpload,
  finalizeBugReportUploadProcedure,
  retryBugReportDebuggerIngestionProcedure,
} from "@crikket/bug-reports/procedures/upload-bug-report"

/**
 * Bug Report Router
 * All logic lives in @crikket/bug-reports package modules
 */
export const bugReportRouter = {
  list: listBugReports,
  createUpload: createBugReportUpload,
  finalizeUpload: finalizeBugReportUploadProcedure,
  retryDebuggerIngestion: retryBugReportDebuggerIngestionProcedure,
  getById: getBugReportById,
  getDebuggerEvents: getBugReportDebuggerEvents,
  getNetworkRequests: getBugReportNetworkRequests,
  getNetworkRequestPayload: getBugReportNetworkRequestPayload,
  getDashboardStats: getBugReportDashboardStats,
  listSites: listBugReportSites,
  listReporters: listBugReportReporters,
  delete: deleteBugReport,
  deleteBulk: deleteBugReportsBulk,
  update: updateBugReport,
  updateBulk: updateBugReportsBulk,
  updateVisibility: updateBugReportVisibility,
  listComments: listBugReportComments,
  addComment: addBugReportComment,
  deleteComment: deleteBugReportComment,
}

// Projects (capture keys as client folders) and their share links. Team only.
export const projectRouter = {
  list: listProjects,
  get: getProject,
  regenerateShareLink: regenerateProjectShareLink,
  disableShareLink: disableProjectShareLink,
  setWidgetColor: setProjectWidgetColor,
}

// Notifications tab. Team only.
export const notificationRouter = {
  list: listNotifications,
  unreadCount: getUnreadNotificationCount,
  markAllRead: markNotificationsRead,
}

// Client share link (/p/<token>). Public: authorised by the token alone.
export const shareRouter = {
  getProject: getSharedProject,
  listReports: listSharedReports,
  getReport: getSharedReport,
  addComment: addSharedComment,
}
