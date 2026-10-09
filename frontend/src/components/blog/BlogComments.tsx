import { blogApi } from "../../api/blog.api";
import { moderationApi } from "../../api/moderation.api";
import { ApiError } from "../../api/client";
import { CommentThread } from "../common/CommentThread";
import type { Comment } from "../../types";
import { t } from "../../i18n";

/** The comments on a blog entry. The author of the entry can take any of them down; anyone signed in can report one. */
export function BlogComments({
  entryId,
  isAuthor,
  onCountChange,
  highlightId = null,
}: {
  entryId: string;
  isAuthor: boolean;
  onCountChange: (update: (count: number) => number) => void;
  highlightId?: string | null;
}) {
  async function report(comment: Comment) {
    const reason = prompt(t("profile.whatsTheIssueWith2"));
    if (!reason) return;
    try {
      await moderationApi.report("blogComment", comment.id, reason);
      alert(t("profile.reportSubmittedThanksFor"));
    } catch (err) {
      alert(err instanceof ApiError ? err.message : t("profile.couldntSubmitThatReport"));
    }
  }

  return (
    <CommentThread
      threadKey={entryId}
      load={(after) => (after ? blogApi.comments(entryId, after) : blogApi.comments(entryId))}
      add={(text, imageUrl, parent) => (parent ? blogApi.addComment(entryId, text, imageUrl, parent) : imageUrl ? blogApi.addComment(entryId, text, imageUrl) : blogApi.addComment(entryId, text))}
      update={(id, text) => blogApi.updateComment(id, text)}
      removePicture={(id) => blogApi.removeCommentPicture(id)}
      remove={(id) => blogApi.removeComment(id)}
      canModerate={isAuthor}
      onReport={report}
      onCountChange={onCountChange}
      highlightId={highlightId}
    />
  );
}
