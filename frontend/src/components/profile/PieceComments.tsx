import { mediaApi } from "../../api/media.api";
import { moderationApi } from "../../api/moderation.api";
import { ApiError } from "../../api/client";
import { CommentThread } from "../common/CommentThread";
import type { Comment } from "../../types";

/** The comments on one portfolio piece. The owner of the piece can take any of them down; anyone signed in can report one. */
export function PieceComments({
  mediaId,
  isOwner,
  onCountChange,
  highlightId = null,
}: {
  mediaId: string;
  isOwner: boolean;
  onCountChange: (update: (count: number) => number) => void;
  highlightId?: string | null;
}) {
  async function report(comment: Comment) {
    const reason = prompt("What's the issue with this comment?");
    if (!reason) return;
    try {
      await moderationApi.report("mediaComment", comment.id, reason);
      alert("Report submitted. Thanks for helping keep this space safe.");
    } catch (err) {
      alert(err instanceof ApiError ? err.message : "Couldn't submit that report.");
    }
  }

  return (
    <CommentThread
      threadKey={mediaId}
      load={(after) => (after ? mediaApi.comments(mediaId, after) : mediaApi.comments(mediaId))}
      add={(text, imageUrl) => (imageUrl ? mediaApi.addComment(mediaId, text, imageUrl) : mediaApi.addComment(mediaId, text))}
      update={(id, text) => mediaApi.updateComment(id, text)}
      removePicture={(id) => mediaApi.removeCommentPicture(id)}
      remove={(id) => mediaApi.removeComment(id)}
      canModerate={isOwner}
      onReport={report}
      onCountChange={onCountChange}
      highlightId={highlightId}
    />
  );
}
