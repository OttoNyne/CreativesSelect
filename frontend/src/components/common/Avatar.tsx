import { assetUrl } from "../../api/client";

function hashHue(input: string): number {
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    hash = (hash * 31 + input.charCodeAt(i)) % 360;
  }
  return hash;
}

export function Avatar({
  username,
  displayName,
  avatarUrl,
  size = 32,
  className = "",
}: {
  username: string;
  displayName: string;
  avatarUrl?: string | null;
  size?: number;
  className?: string;
}) {
  const resolved = assetUrl(avatarUrl);
  if (resolved) {
    return (
      <img
        src={resolved}
        alt={displayName}
        className={`rounded-full object-cover ${className}`}
        style={{ width: size, height: size }}
      />
    );
  }

  const hue = hashHue(username);
  const initial = displayName.trim().charAt(0).toUpperCase() || "?";

  return (
    <div
      className={`flex shrink-0 items-center justify-center rounded-full font-semibold text-white ${className}`}
      style={{
        width: size,
        height: size,
        fontSize: size * 0.45,
        background: `hsl(${hue}, 65%, 40%)`,
      }}
    >
      {initial}
    </div>
  );
}
