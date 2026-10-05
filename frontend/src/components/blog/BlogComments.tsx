import { blogApi } from "../../api/blog.api";
import { moderationApi } from "../../api/moderation.api";
import { ApiError } from "../../api/client";
import { CommentThread } from "../common/CommentThread";
import type { Comment } from "../../types";

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
    const reason = prompt("What's the issue with this comment?");
    if (!reason) return;
    try {
      await moderationApi.report("blogComment", comment.id, reason);
      alert("Report submitted. Thanks for helping keep this space safe.");
    } catch (err) {
      alert(err instanceof ApiError ? err.message : "Couldn't submit that report.");
    }
  }

  return (
    <CommentThread
      threadKey={entryId}
      load={(after) => (after ? blogApi.comments(entryId, after) : blogApi.comments(entryId))}
      add={(text, imageUrl) => (imageUrl ? blogApi.addComment(entryId, text, imageUrl) : blogApi.addComment(entryId, text))}
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
