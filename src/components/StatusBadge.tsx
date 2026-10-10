import { STATUSES, type Status } from '../types.ts';

export function StatusBadge({ status }: { status: Status }) {
  const s = STATUSES.find((x) => x.id === status) ?? STATUSES[0];
  return (
    <span className="badge" style={{ '--badge': s.color } as React.CSSProperties}>
      {s.label}
    </span>
  );
}
