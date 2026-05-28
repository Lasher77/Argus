# Nachtrag zur CLAUDE.md – Rollenmodell präzisiert

> Dieser Abschnitt ergänzt Abschnitt 1 ("Die drei Nutzer und ihre Rollen") der
> CLAUDE.md. Bei Widerspruch gilt dieser Nachtrag.

## Der Chef ist gleichzeitig auch Monteur

Der Chef arbeitet selbst beim Kunden. Er hat deshalb ZWEI getrennte Bereiche:

1. **Dashboard (Geschäftsführung):** Gesamtüberblick über ALLE Aufträge aller
   Personen, Kennzahlen, Aufträge anlegen und zuweisen. Wie bisher beschrieben.

2. **Meine Aufträge (Arbeitsansicht):** Die exakt gleiche mobile Arbeitsansicht
   wie beim Monteur, angewendet auf die dem Chef SELBST zugewiesenen Aufträge.
   Hier kann der Chef Arbeit starten, den Timer nutzen, Material erfassen, Fotos
   hochladen und Aufträge erledigen – genau wie ein Monteur, aber nur für seine
   eigenen zugewiesenen Aufträge.

## Verbindliche Regeln

- Ein Auftrag kann jeder Person mit Arbeits-Funktion zugewiesen werden – sowohl
  einem Monteur als auch dem Chef (beide sind Einträge in `users`).
- Die **Arbeitsansicht** zeigt jeder Person nur die IHR SELBST zugewiesenen
  Aufträge (Status `geplant`/`arbeit`). Das gilt für Chef und Monteur gleich.
  Der Chef sieht in seiner Arbeitsansicht NICHT die Aufträge des Monteurs – die
  bleibt schlank und aufgeräumt.
- Den Blick auf ALLE Aufträge bekommt der Chef ausschließlich über das Dashboard,
  nicht über die Arbeitsansicht.
- Ein Auftrag ist immer genau EINER Person zur Abarbeitung zugewiesen
  (`monteur_id`). Dadurch bleiben Stundenerfassung und Zuordnung eindeutig.
- Serverseitige Rechteprüfung bleibt bestehen: Arbeits-Aktionen (Timer, Material,
  Foto, erledigen) darf eine Person nur an Aufträgen ausführen, die ihr selbst
  zugewiesen sind. Der Chef bildet hier KEINE Ausnahme – auch er bearbeitet im
  Arbeitsmodus nur seine eigenen, nicht die des Monteurs.
- Dashboard-/Verwaltungs-Aktionen (anlegen, zuweisen, Rechnungen) bleiben dem
  Chef bzw. dem Büro vorbehalten.

## Bewusst NICHT in dieser Version

- Gemeinsames Arbeiten mehrerer Personen am selben Auftrag (z. B. Chef und
  Monteur gleichzeitig mit getrennter Stundenerfassung). Falls später benötigt,
  wird das als eigene Erweiterung modelliert – nicht durch Aufweichen der
  "ein Auftrag, eine zugewiesene Person"-Regel.
