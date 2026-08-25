import { useRef, useState } from "react";
import { postsApi } from "../../api/posts.api";
import { uploadFile } from "../../api/media.api";
import { assetUrl } from "../../api/client";
import { GenerateTextButton } from "../ai/GenerateTextButton";
import { GenerateImageButton } from "../ai/GenerateImageButton";
import type { Post } from "../../types";

export function PostComposer({ onPosted }: { onPosted: (post: Post) => void }) {
  const [content, setContent] = useState("");
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [isAiText, setIsAiText] = useState(false);
  const [isAiImage, setIsAiImage] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!content.trim()) return;
    setSubmitting(true);
    try {
      const { post } = await postsApi.create({ content: content.trim(), imageUrl, isAiText, isAiImage });
      onPosted(post);
      setContent("");
      setImageUrl(null);
      setIsAiText(false);
      setIsAiImage(false);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const { url } = await uploadFile(file, "portfolio");
    setImageUrl(url);
    setIsAiImage(false);
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder="Share what you're working on…"
        rows={3}
        className="w-full resize-none rounded-md border border-white/10 bg-black/30 px-3 py-2 text-sm text-white placeholder:text-white/30 focus:border-violet-500 focus:outline-none"
      />

      {imageUrl && (
        <div className="relative mt-2 inline-block">
          <img src={assetUrl(imageUrl)} alt="" className="max-h-64 rounded-lg" />
          <button
            type="button"
            onClick={() => {
              setImageUrl(null);
              setIsAiImage(false);
            }}
            className="absolute right-2 top-2 rounded-full bg-black/70 px-2 py-0.5 text-xs text-white"
          >
            ✕
          </button>
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <GenerateTextButton
          kind="caption"
          getPrompt={() => content}
          onGenerated={(text) => {
            setContent(text);
            setIsAiText(true);
          }}
        />
        <GenerateImageButton
          kind="post"
          getPrompt={() => content}
          onGenerated={(url) => {
            setImageUrl(url);
            setIsAiImage(true);
          }}
        />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="rounded-md border border-white/15 px-3 py-1.5 text-xs font-medium text-white/70 hover:bg-white/10"
        >
          📎 Attach image
        </button>
        <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />

        <button
          type="submit"
          disabled={submitting || !content.trim()}
          className="ml-auto rounded-md bg-violet-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-violet-500 disabled:opacity-50"
        >
          {submitting ? "Posting…" : "Post"}
        </button>
      </div>
    </form>
  );
}
