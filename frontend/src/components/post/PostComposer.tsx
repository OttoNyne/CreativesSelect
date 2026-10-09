import { useRef, useState } from "react";
import { postsApi } from "../../api/posts.api";
import { uploadFile } from "../../api/media.api";
import { assetUrl, ApiError } from "../../api/client";
import { GenerateTextButton } from "../ai/GenerateTextButton";
import { GenerateImageButton } from "../ai/GenerateImageButton";
import { ImageAdjuster } from "./ImageAdjuster";
import { DEFAULT_FRAMING, type ImageFraming } from "../../lib/framing";
import type { Post } from "../../types";
import { t } from "../../i18n";
import { MentionTextarea } from "../common/MentionField";
import { PollEditor, type PollDays } from "./PollEditor";

export function PostComposer({ onPosted }: { onPosted: (post: Post) => void }) {
  const [content, setContent] = useState("");
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [framing, setFraming] = useState<ImageFraming>(DEFAULT_FRAMING);
  const [isAiText, setIsAiText] = useState(false);
  const [isAiImage, setIsAiImage] = useState(false);
  const [alt, setAlt] = useState("");
  // a poll being written: its options and how long it stays open (null when the post has none)
  const [pollOptions, setPollOptions] = useState<string[] | null>(null);
  const [pollDays, setPollDays] = useState<PollDays>(1);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!content.trim()) return;
    const options = (pollOptions ?? []).map((o) => o.trim()).filter(Boolean);
    if (pollOptions && options.length < 2) return setError(t("polls.needTwo"));
    setSubmitting(true);
    setError(null);
    try {
      const { post } = await postsApi.create({
        content: content.trim(),
        imageUrl,
        // how the picture was framed, sent only when there is a picture
        ...(imageUrl ? { imageAspect: framing.aspect, imageZoom: framing.zoom, imagePosition: framing.position, ...(alt.trim() ? { imageAlt: alt.trim() } : {}) } : {}),
        isAiText,
        isAiImage,
        ...(pollOptions ? { poll: { options, days: pollDays } } : {}),
      });
      onPosted(post);
      setContent("");
      setImageUrl(null);
      setFraming(DEFAULT_FRAMING);
      setIsAiText(false);
      setIsAiImage(false);
      setAlt("");
      setPollOptions(null);
      setPollDays(1);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("composer.postFailed"));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    try {
      const { url } = await uploadFile(file, "portfolio");
      setImageUrl(url);
      setFraming(DEFAULT_FRAMING);
      setIsAiImage(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("composer.uploadFailed"));
    }
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
      <MentionTextarea
        id="post-composer"
        dir="auto"
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder={t("composer.placeholder")}
        rows={3}
        className="w-full resize-none rounded-md border border-white/10 bg-black/30 px-3 py-2 text-sm text-white placeholder:text-white/55 focus:border-violet-500 focus:outline-none"
      />

      {imageUrl && (
        <div className="relative">
          <ImageAdjuster src={assetUrl(imageUrl)} value={framing} onChange={setFraming} />
          <button
            type="button"
            aria-label={t("composer.removePicture")}
            onClick={() => {
              setImageUrl(null);
              setFraming(DEFAULT_FRAMING);
              setIsAiImage(false);
              setAlt("");
            }}
            className="absolute end-2 top-2 rounded-full bg-black/70 px-2 py-0.5 text-xs text-white"
          >
            ✕
          </button>
        </div>
      )}
      {imageUrl && (
        <label className="mt-2 block text-xs text-white/70">
          {t("composer.pictureDescription")}
          <input
            value={alt}
            onChange={(e) => setAlt(e.target.value)}
            maxLength={300}
            dir="auto"
            placeholder={t("composer.pictureDescriptionPlaceholder")}
            aria-describedby="alt-hint"
            className="mt-1 w-full rounded-md border border-white/10 bg-black/30 px-3 py-2 text-sm text-white placeholder:text-white/55 focus:border-violet-500 focus:outline-none"
          />
          <span id="alt-hint" className="mt-1 block text-white/60">
            {t("composer.pictureDescriptionHint")}
          </span>
        </label>
      )}

      {pollOptions && <PollEditor options={pollOptions} days={pollDays} onOptions={setPollOptions} onDays={setPollDays} onRemove={() => setPollOptions(null)} />}

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
            setFraming(DEFAULT_FRAMING);
            setIsAiImage(true);
            // the picture was made from these words, so they describe it
            setAlt(content.trim().slice(0, 300));
          }}
        />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="rounded-md border border-white/15 px-3 py-1.5 text-xs font-medium text-white/70 hover:bg-white/10"
        >
          {t("composer.attach")}
        </button>
        <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
        {!pollOptions && (
          <button type="button" onClick={() => setPollOptions(["", ""])} className="rounded-md border border-white/15 px-3 py-1.5 text-xs font-medium text-white/70 hover:bg-white/10">
            {t("polls.add")}
          </button>
        )}

        <button
          type="submit"
          disabled={submitting || !content.trim()}
          className="ms-auto rounded-md bg-violet-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-violet-500 disabled:opacity-50"
        >
          {submitting ? t("composer.posting") : t("composer.post")}
        </button>
      </div>
      {error && <p className="mt-2 text-xs text-red-400">{error}</p>}
    </form>
  );
}
