import { Link } from "react-router-dom";
import { assetUrl } from "../../api/client";
import type { Post } from "../../types";
import { Avatar } from "../common/Avatar";
import { CSBadge } from "../common/CSBadge";
import { FramedImage } from "../common/FramedImage";
import { Linkified } from "../common/Linkified";
import { shortAgo } from "../../lib/when";
import { t } from "../../i18n";

/** The post a repost shares, drawn inside it: the author, the words and the picture, with a link to the post itself; or a plain note when it is gone. */
export function SharedPost({ repost }: { repost: NonNullable<Post["repost"]> }) {
  if (!repost.available) {
    return <p className="mt-3 rounded-lg border border-dashed border-white/15 p-3 text-xs text-white/60">{t("post.originalGone")}</p>;
  }
  const author = repost.author;
  return (
    <div className="mt-3 rounded-lg border border-white/10 bg-black/20 p-3">
      <div className="flex items-center gap-2">
        <Link to={`/u/${author.username}`}>
          <Avatar username={author.username} displayName={author.displayName} avatarUrl={author.avatarUrl} size={28} />
        </Link>
        <div className="min-w-0 text-xs">
          <Link to={`/u/${author.username}`} className="font-medium text-white hover:underline">
            {author.displayName}
          </Link>
          <CSBadge verified={author.csVerified} size={12} className="ms-1" />
          <div className="text-white/60">
            <bdi>@{author.username}</bdi> · {shortAgo(repost.createdAt)}
          </div>
        </div>
      </div>
      {repost.content && (
        <p dir="auto" className="mt-2 whitespace-pre-wrap break-words text-sm text-white/90">
          <Linkified text={repost.content} />
        </p>
      )}
      {repost.imageUrl && <FramedImage src={assetUrl(repost.imageUrl)} aspect={repost.imageAspect ?? "original"} zoom={repost.imageZoom ?? 1} position={repost.imagePosition ?? "50% 50%"} className="mt-2 rounded-lg" />}
      <Link to={`/posts/${repost.id}`} className="mt-2 inline-block text-xs text-violet-300 hover:underline">
        {t("post.viewOriginal")}
      </Link>
    </div>
  );
}
