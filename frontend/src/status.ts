export type Status =
  | 'neu'
  | 'geplant'
  | 'arbeit'
  | 'erledigt'
  | 'rechnung'
  | 'bezahlt'

export const STATUS_LABEL: Record<Status, string> = {
  neu: 'Neu',
  geplant: 'Geplant',
  arbeit: 'In Arbeit',
  erledigt: 'Erledigt',
  rechnung: 'Rechnung',
  bezahlt: 'Bezahlt',
}
