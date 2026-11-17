CREATE TABLE "bug_report_comment" (
	"id" text PRIMARY KEY NOT NULL,
	"bug_report_id" text NOT NULL,
	"organization_id" text NOT NULL,
	"author_id" text,
	"body" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "bug_report" ALTER COLUMN "status" SET DEFAULT 'to_do';--> statement-breakpoint
ALTER TABLE "bug_report" ALTER COLUMN "priority" SET DEFAULT 'normal';--> statement-breakpoint
ALTER TABLE "bug_report_upload_session" ALTER COLUMN "priority" SET DEFAULT 'normal';--> statement-breakpoint
ALTER TABLE "bug_report_comment" ADD CONSTRAINT "bug_report_comment_bug_report_id_bug_report_id_fk" FOREIGN KEY ("bug_report_id") REFERENCES "public"."bug_report"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bug_report_comment" ADD CONSTRAINT "bug_report_comment_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bug_report_comment" ADD CONSTRAINT "bug_report_comment_author_id_user_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "bug_report_comment_bugReportId_idx" ON "bug_report_comment" USING btree ("bug_report_id","created_at");--> statement-breakpoint
-- Map the old Crikket statuses and priorities onto the Yes Chef ones.
UPDATE "bug_report" SET "status" = CASE "status"
	WHEN 'open' THEN 'to_do'
	WHEN 'in_progress' THEN 'planning'
	WHEN 'resolved' THEN 'final_check'
	ELSE "status" END
WHERE "status" IN ('open', 'in_progress', 'resolved');--> statement-breakpoint
UPDATE "bug_report" SET "priority" = CASE "priority"
	WHEN 'critical' THEN 'high'
	WHEN 'medium' THEN 'normal'
	WHEN 'none' THEN 'normal'
	ELSE "priority" END
WHERE "priority" IN ('critical', 'medium', 'none');--> statement-breakpoint
UPDATE "bug_report_upload_session" SET "priority" = CASE "priority"
	WHEN 'critical' THEN 'high'
	ELSE 'normal' END
WHERE "priority" IN ('critical', 'medium', 'none');
