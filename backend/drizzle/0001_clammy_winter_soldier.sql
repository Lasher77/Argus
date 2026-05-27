CREATE TABLE IF NOT EXISTS "firma_stammdaten" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"feld_name" text NOT NULL,
	"wert" text NOT NULL,
	"gueltig_von" date NOT NULL,
	"gueltig_bis" date
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "rechnung_zaehler" (
	"jahr" integer PRIMARY KEY NOT NULL,
	"letzte_nr" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "rechnungen" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"auftrag_id" uuid NOT NULL,
	"nummer" text NOT NULL,
	"jahr" integer NOT NULL,
	"laufende_nr" integer NOT NULL,
	"datum" date NOT NULL,
	"leistungsdatum" date,
	"firma_snapshot" jsonb NOT NULL,
	"kunde_snapshot" jsonb NOT NULL,
	"positionen" jsonb NOT NULL,
	"netto" numeric(12, 2) NOT NULL,
	"mwst_satz" numeric(5, 2) NOT NULL,
	"mwst_betrag" numeric(12, 2) NOT NULL,
	"brutto" numeric(12, 2) NOT NULL,
	"pdf_pfad" text NOT NULL,
	"erstellt_am" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "rechnungen_nummer_unique" UNIQUE("nummer")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "rechnungen" ADD CONSTRAINT "rechnungen_auftrag_id_auftraege_id_fk" FOREIGN KEY ("auftrag_id") REFERENCES "public"."auftraege"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
