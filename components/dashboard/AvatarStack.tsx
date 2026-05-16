interface MemberStub {
  id: string;
  name: string;
}

function hueBucket(name: string): number {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) & 0xffff;
  return h % 12;
}

interface AvatarStackProps {
  assigneeUserIds: string[];
  members: MemberStub[];
}

export function AvatarStack({ assigneeUserIds, members }: AvatarStackProps) {
  const matched = assigneeUserIds
    .map((id) => members.find((m) => m.id === id))
    .filter((m): m is MemberStub => m !== undefined);

  if (matched.length === 0) return null;

  const visible = matched.slice(0, 3);
  const overflow = matched.length - visible.length;

  return (
    <span className="avatar-stack" aria-label={matched.map((m) => m.name).join(', ')}>
      {visible.map((m) => (
        <span
          key={m.id}
          className={`avatar avatar-h${hueBucket(m.name)}`}
          title={m.name}
        >
          {m.name.charAt(0).toUpperCase()}
        </span>
      ))}
      {overflow > 0 && (
        <span className="avatar more" title={`+${overflow} weitere`}>
          +{overflow}
        </span>
      )}
    </span>
  );
}
