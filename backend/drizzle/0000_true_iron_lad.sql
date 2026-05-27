CREATE TYPE "public"."auftrag_status" AS ENUM('neu', 'geplant', 'arbeit', 'erledigt', 'rechnung', 'bezahlt');--> statement-breakpoint
CREATE TYPE "public"."rolle" AS ENUM('chef', 'monteur', 'buero');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "auftraege" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kunde_id" uuid NOT NULL,
	"titel" text NOT NULL,
	"beschreibung" text,
	"status" "auftrag_status" DEFAULT 'neu' NOT NULL,
	"monteur_id" uuid,
	"termin" timestamp with time zone,
	"stundensatz" numeric(10, 2),
	"stunden" numeric(10, 2) DEFAULT '0' NOT NULL,
	"erstellt_am" timestamp with time zone DEFAULT now() NOT NULL,
	"erledigt_am" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "auftrag_material" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"auftrag_id" uuid NOT NULL,
	"bezeichnung" text NOT NULL,
	"einzelpreis" numeric(10, 2) NOT NULL,
	"menge" numeric(10, 2) DEFAULT '1' NOT NULL,
	"einheit" text DEFAULT 'Stück' NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "fotos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"auftrag_id" uuid NOT NULL,
	"pfad" text NOT NULL,
	"hochgeladen_am" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "kunden" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"adresse" text,
	"telefon" text,
	"email" text,
	"notiz" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "material_katalog" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"bezeichnung" text NOT NULL,
	"einzelpreis" numeric(10, 2) NOT NULL,
	"einheit" text DEFAULT 'Stück' NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "mwst_saetze" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"satz" numeric(5, 2) NOT NULL,
	"gueltig_ab" date NOT NULL,
	"gueltig_bis" date
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"passwort_hash" text NOT NULL,
	"rolle" "rolle" NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "auftraege" ADD CONSTRAINT "auftraege_kunde_id_kunden_id_fk" FOREIGN KEY ("kunde_id") REFERENCES "public"."kunden"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "auftraege" ADD CONSTRAINT "auftraege_monteur_id_users_id_fk" FOREIGN KEY ("monteur_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "auftrag_material" ADD CONSTRAINT "auftrag_material_auftrag_id_auftraege_id_fk" FOREIGN KEY ("auftrag_id") REFERENCES "public"."auftraege"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "fotos" ADD CONSTRAINT "fotos_auftrag_id_auftraege_id_fk" FOREIGN KEY ("auftrag_id") REFERENCES "public"."auftraege"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
