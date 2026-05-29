CREATE TYPE "public"."rechnung_status" AS ENUM('offen', 'bezahlt');--> statement-breakpoint
ALTER TYPE "public"."auftrag_status" ADD VALUE 'berechnet';--> statement-breakpoint
ALTER TABLE "rechnungen" ALTER COLUMN "auftrag_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "rechnungen" ADD COLUMN "kunde_id" uuid;--> statement-breakpoint
UPDATE "rechnungen" r SET "kunde_id" = a."kunde_id" FROM "auftraege" a WHERE r."auftrag_id" = a."id";--> statement-breakpoint
ALTER TABLE "rechnungen" ALTER COLUMN "kunde_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "rechnungen" ADD COLUMN "status" "rechnung_status" DEFAULT 'offen' NOT NULL;--> statement-breakpoint
ALTER TABLE "rechnungen" ADD COLUMN "bezahlt_am" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "rechnungen" ADD COLUMN "objekt" text;--> statement-breakpoint
ALTER TABLE "rechnungen" ADD COLUMN "beschreibung" text;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "rechnungen" ADD CONSTRAINT "rechnungen_kunde_id_kunden_id_fk" FOREIGN KEY ("kunde_id") REFERENCES "public"."kunden"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
