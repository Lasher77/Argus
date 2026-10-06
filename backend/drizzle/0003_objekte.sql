-- Umbau auf das Objekt-Modell (Hausverwaltung -> Objekt -> Einheit).
-- BEWUSST DESTRUKTIV (freigegeben, System war noch nicht produktiv): Die alten
-- Kunden-, Auftrags-, Rechnungs-, Material- und Foto-Daten werden entfernt, der
-- Rechnungsnummern-Zähler wird zurückgesetzt, damit die Nummern wieder lückenlos
-- bei 0001 beginnen. Benutzer, Firmen-Stammdaten, Material-Katalog, MwSt und
-- Logo bleiben erhalten.
TRUNCATE TABLE "fotos", "auftrag_material", "rechnungen", "auftraege", "kunden";--> statement-breakpoint
DELETE FROM "rechnung_zaehler";--> statement-breakpoint

CREATE TYPE "public"."rechnung_quelle" AS ENUM('eigen', 'objekt', 'hausverwaltung');--> statement-breakpoint

CREATE TABLE "hausverwaltungen" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"notiz" text,
	"rechnung_empfaenger" text,
	"rechnung_strasse" text,
	"rechnung_ort" text,
	"rechnung_email" text,
	"rechnung_kundennr" text,
	"archiviert" boolean DEFAULT false NOT NULL
);--> statement-breakpoint

CREATE TABLE "ansprechpartner" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"rolle" text,
	"telefon" text,
	"email" text,
	"notiz" text,
	"hausverwaltung_id" uuid,
	"archiviert" boolean DEFAULT false NOT NULL
);--> statement-breakpoint

CREATE TABLE "objekte" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"strasse" text,
	"hausnummer" text,
	"plz" text,
	"ort" text,
	"hausverwaltung_id" uuid,
	"ansprechpartner_id" uuid,
	"vor_ort_name" text,
	"vor_ort_telefon" text,
	"vor_ort_email" text,
	"rechnung_quelle" "rechnung_quelle" DEFAULT 'hausverwaltung' NOT NULL,
	"rechnung_empfaenger" text,
	"rechnung_strasse" text,
	"rechnung_ort" text,
	"rechnung_email" text,
	"rechnung_kundennr" text,
	"notiz" text,
	"archiviert" boolean DEFAULT false NOT NULL
);--> statement-breakpoint

CREATE TABLE "einheiten" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"objekt_id" uuid NOT NULL,
	"bezeichnung" text NOT NULL,
	"hausverwaltung_id" uuid,
	"ansprechpartner_id" uuid,
	"vor_ort_name" text,
	"vor_ort_telefon" text,
	"vor_ort_email" text,
	"rechnung_quelle" "rechnung_quelle" DEFAULT 'objekt' NOT NULL,
	"rechnung_empfaenger" text,
	"rechnung_strasse" text,
	"rechnung_ort" text,
	"rechnung_email" text,
	"rechnung_kundennr" text,
	"notiz" text,
	"archiviert" boolean DEFAULT false NOT NULL
);--> statement-breakpoint

ALTER TABLE "auftraege" DROP COLUMN "kunde_id";--> statement-breakpoint
ALTER TABLE "auftraege" ADD COLUMN "objekt_id" uuid;--> statement-breakpoint
ALTER TABLE "auftraege" ADD COLUMN "einheit_id" uuid;--> statement-breakpoint
ALTER TABLE "auftraege" ADD COLUMN "einsatzort" text;--> statement-breakpoint

ALTER TABLE "rechnungen" DROP COLUMN "kunde_id";--> statement-breakpoint
ALTER TABLE "rechnungen" DROP COLUMN "kunde_snapshot";--> statement-breakpoint
ALTER TABLE "rechnungen" ADD COLUMN "empfaenger_snapshot" jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "rechnungen" ADD COLUMN "objekt_id" uuid;--> statement-breakpoint
ALTER TABLE "rechnungen" ADD COLUMN "einheit_id" uuid;--> statement-breakpoint

DROP TABLE "kunden";--> statement-breakpoint

ALTER TABLE "ansprechpartner" ADD CONSTRAINT "ansprechpartner_hausverwaltung_id_hausverwaltungen_id_fk" FOREIGN KEY ("hausverwaltung_id") REFERENCES "public"."hausverwaltungen"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "objekte" ADD CONSTRAINT "objekte_hausverwaltung_id_hausverwaltungen_id_fk" FOREIGN KEY ("hausverwaltung_id") REFERENCES "public"."hausverwaltungen"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "objekte" ADD CONSTRAINT "objekte_ansprechpartner_id_ansprechpartner_id_fk" FOREIGN KEY ("ansprechpartner_id") REFERENCES "public"."ansprechpartner"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "einheiten" ADD CONSTRAINT "einheiten_objekt_id_objekte_id_fk" FOREIGN KEY ("objekt_id") REFERENCES "public"."objekte"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "einheiten" ADD CONSTRAINT "einheiten_hausverwaltung_id_hausverwaltungen_id_fk" FOREIGN KEY ("hausverwaltung_id") REFERENCES "public"."hausverwaltungen"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "einheiten" ADD CONSTRAINT "einheiten_ansprechpartner_id_ansprechpartner_id_fk" FOREIGN KEY ("ansprechpartner_id") REFERENCES "public"."ansprechpartner"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auftraege" ADD CONSTRAINT "auftraege_objekt_id_objekte_id_fk" FOREIGN KEY ("objekt_id") REFERENCES "public"."objekte"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auftraege" ADD CONSTRAINT "auftraege_einheit_id_einheiten_id_fk" FOREIGN KEY ("einheit_id") REFERENCES "public"."einheiten"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rechnungen" ADD CONSTRAINT "rechnungen_objekt_id_objekte_id_fk" FOREIGN KEY ("objekt_id") REFERENCES "public"."objekte"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rechnungen" ADD CONSTRAINT "rechnungen_einheit_id_einheiten_id_fk" FOREIGN KEY ("einheit_id") REFERENCES "public"."einheiten"("id") ON DELETE no action ON UPDATE no action;
