ALTER TABLE "bug_report" ADD COLUMN "reporter_name" text;--> statement-breakpoint
ALTER TABLE "bug_report" ADD COLUMN "reporter_email" text;--> statement-breakpoint
ALTER TABLE "bug_report" ADD COLUMN "capture_public_key_id" text;--> statement-breakpoint
ALTER TABLE "bug_report_upload_session" ADD COLUMN "reporter_name" text;--> statement-breakpoint
ALTER TABLE "bug_report_upload_session" ADD COLUMN "reporter_email" text;--> statement-breakpoint
ALTER TABLE "bug_report_upload_session" ADD COLUMN "capture_public_key_id" text;--> statement-breakpoint
ALTER TABLE "bug_report" ADD CONSTRAINT "bug_report_capture_public_key_id_capture_public_key_id_fk" FOREIGN KEY ("capture_public_key_id") REFERENCES "public"."capture_public_key"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bug_report_upload_session" ADD CONSTRAINT "bug_report_upload_session_capture_public_key_id_capture_public_key_id_fk" FOREIGN KEY ("capture_public_key_id") REFERENCES "public"."capture_public_key"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "bug_report_capturePublicKeyId_idx" ON "bug_report" USING btree ("capture_public_key_id");