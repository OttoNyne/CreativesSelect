import { mediaApi } from "../../api/media.api";
import { moderationApi } from "../../api/moderation.api";
import { ApiError } from "../../api/client";
import { CommentThread } from "../common/CommentThread";
import type { Comment } from "../../types";
import { t } from "../../i18n";

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
    const reason = prompt(t("profile.whatsTheIssueWith2"));
    if (!reason) return;
    try {
      await moderationApi.report("mediaComment", comment.id, reason);
      alert(t("profile.reportSubmittedThanksFor"));
    } catch (err) {
      alert(err instanceof ApiError ? err.message : t("profile.couldntSubmitThatReport"));
    }
  }

  return (
    <CommentThread
      threadKey={mediaId}
      load={(after) => (after ? mediaApi.comments(mediaId, after) : mediaApi.comments(mediaId))}
      add={(text, imageUrl, parent) => (parent ? mediaApi.addComment(mediaId, text, imageUrl, parent) : imageUrl ? mediaApi.addComment(mediaId, text, imageUrl) : mediaApi.addComment(mediaId, text))}
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
