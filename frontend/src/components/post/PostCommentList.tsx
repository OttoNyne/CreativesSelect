import { postsApi } from "../../api/posts.api";
import { CommentThread } from "../common/CommentThread";

export function PostCommentList({
  postId,
  onCountChange,
  highlightId = null,
}: {
  postId: string;
  /** Told when a comment is added, as a change to the post's count (the list may hold only some of the comments). */
  onCountChange: (update: (count: number) => number) => void;
  /** A comment to scroll to and highlight once the list has loaded. */
  highlightId?: string | null;
}) {
  return (
    <CommentThread
      threadKey={postId}
      load={(after) => (after ? postsApi.comments(postId, after) : postsApi.comments(postId))}
      add={(text) => postsApi.addComment(postId, text)}
      update={(id, text) => postsApi.updateComment(id, text)}
      onCountChange={onCountChange}
      highlightId={highlightId}
    />
  );
}
