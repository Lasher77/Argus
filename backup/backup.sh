#!/bin/sh
# Tägliches Backup der Postgres-Datenbank als gzipped SQL-Dump.
# Läuft als langlebiger Prozess im Sidecar-Container; nimmt PG-Zugangsdaten
# aus Umgebungsvariablen (PGHOST/PGUSER/PGPASSWORD/PGDATABASE).

set -eu

BACKUP_DIR="${BACKUP_DIR:-/backups}"
KEEP_DAYS="${BACKUP_KEEP_DAYS:-14}"
INTERVAL="${BACKUP_INTERVAL_SECONDS:-86400}"

mkdir -p "$BACKUP_DIR"

stempel() { date -u +%Y-%m-%dT%H:%M:%SZ; }

echo "[$(stempel)] Backup-Dienst gestartet."
echo "[$(stempel)]   Verzeichnis : $BACKUP_DIR"
echo "[$(stempel)]   Aufbewahrung: $KEEP_DAYS Tage"
echo "[$(stempel)]   Intervall   : $INTERVAL Sekunden"

while true; do
    DATEI="$BACKUP_DIR/auftragsbuch-$(date -u +%Y%m%d-%H%M%S).sql.gz"
    TMP="$DATEI.partial"

    echo "[$(stempel)] Erstelle $DATEI"
    if pg_dump --no-owner --clean --if-exists | gzip -9 >"$TMP"; then
        mv "$TMP" "$DATEI"
        echo "[$(stempel)]   ok ($(wc -c <"$DATEI") Bytes)"
    else
        echo "[$(stempel)]   FEHLER beim pg_dump"
        rm -f "$TMP"
    fi

    # Alte Backups löschen (älter als KEEP_DAYS Tage).
    find "$BACKUP_DIR" -name 'auftragsbuch-*.sql.gz' -type f -mtime "+$KEEP_DAYS" -delete

    sleep "$INTERVAL"
done
