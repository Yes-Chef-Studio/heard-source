CREATE TABLE "notification" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"type" text NOT NULL,
	"bug_report_id" text,
	"comment_id" text,
	"capture_public_key_id" text,
	"actor_name" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notification_read_state" (
	"user_id" text NOT NULL,
	"organization_id" text NOT NULL,
	"last_read_at" timestamp NOT NULL,
	CONSTRAINT "notification_read_state_user_id_organization_id_pk" PRIMARY KEY("user_id","organization_id")
);
--> statement-breakpoint
ALTER TABLE "bug_report_comment" ADD COLUMN "source" text DEFAULT 'team' NOT NULL;--> statement-breakpoint
ALTER TABLE "bug_report_comment" ADD COLUMN "author_name" text;--> statement-breakpoint
ALTER TABLE "bug_report_comment" ADD COLUMN "author_email" text;--> statement-breakpoint
ALTER TABLE "capture_public_key" ADD COLUMN "share_token" text;--> statement-breakpoint
ALTER TABLE "notification" ADD CONSTRAINT "notification_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification" ADD CONSTRAINT "notification_bug_report_id_bug_report_id_fk" FOREIGN KEY ("bug_report_id") REFERENCES "public"."bug_report"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification" ADD CONSTRAINT "notification_comment_id_bug_report_comment_id_fk" FOREIGN KEY ("comment_id") REFERENCES "public"."bug_report_comment"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification" ADD CONSTRAINT "notification_capture_public_key_id_capture_public_key_id_fk" FOREIGN KEY ("capture_public_key_id") REFERENCES "public"."capture_public_key"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_read_state" ADD CONSTRAINT "notification_read_state_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_read_state" ADD CONSTRAINT "notification_read_state_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "notification_org_createdAt_idx" ON "notification" USING btree ("organization_id","created_at");--> statement-breakpoint
ALTER TABLE "capture_public_key" ADD CONSTRAINT "capture_public_key_share_token_unique" UNIQUE("share_token");--> statement-breakpoint
-- Reports filed before reports recorded their capture key: attach each to the project (key)
-- in the same org whose allowed sites include the report's origin. Ambiguous matches stay unset.
UPDATE "bug_report" AS r SET "capture_public_key_id" = m.key_id
FROM (
	SELECT r2.id AS report_id, min(k.id) AS key_id, count(*) AS n
	FROM "bug_report" r2
	JOIN "capture_public_key" k
		ON k.organization_id = r2.organization_id
		AND lower(substring(r2.url from '^[a-zA-Z][a-zA-Z0-9+.-]*://[^/?#]+')) = ANY (SELECT lower(o) FROM unnest(k.allowed_origins) AS o)
	WHERE r2.capture_public_key_id IS NULL AND r2.url IS NOT NULL
	GROUP BY r2.id
) AS m
WHERE r.id = m.report_id AND m.n = 1;
