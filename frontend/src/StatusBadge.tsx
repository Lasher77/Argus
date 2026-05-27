import { STATUS_LABEL, type Status } from './status'

export default function StatusBadge({ status }: { status: Status }) {
  return <span className={`badge badge-${status}`}>{STATUS_LABEL[status]}</span>
}
