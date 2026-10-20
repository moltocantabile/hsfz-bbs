export function Avatar({
  user,
  size = 40,
  className = "",
}: {
  user: { nickname: string; username: string; avatar?: string | null };
  size?: number;
  className?: string;
}) {
  const style = { width: size, height: size };
  if (user.avatar) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={user.avatar}
        alt={user.nickname}
        style={style}
        className={`shrink-0 rounded-md border border-line bg-card object-cover ${className}`}
      />
    );
  }
  return (
    <span
      style={style}
      className={`inline-flex shrink-0 select-none items-center justify-center rounded-md font-medium text-brand bg-soft ${className}`}
      aria-hidden
    >
      <span style={{ fontSize: Math.round(size * 0.45), lineHeight: 1 }}>
        {user.nickname.slice(0, 1).toUpperCase()}
      </span>
    </span>
  );
}
