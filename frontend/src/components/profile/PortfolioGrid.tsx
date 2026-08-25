import { useEffect, useRef, useState } from "react";
import { mediaApi, uploadFile } from "../../api/media.api";
import { assetUrl } from "../../api/client";
import { GenerateImageButton } from "../ai/GenerateImageButton";
import type { MediaItem } from "../../types";

export function PortfolioGrid({ username, isOwner }: { username: string; isOwner: boolean }) {
  const [items, setItems] = useState<MediaItem[]>([]);
  const [prompt, setPrompt] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    mediaApi.byUser(username).then(({ media }) => setItems(media));
  }, [username]);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const { mediaItem } = await uploadFile(file, "portfolio");
    if (mediaItem) setItems((i) => [mediaItem, ...i]);
  }

  async function handleAiGenerated(url: string) {
    setItems((i) => [
      {
        id: crypto.randomUUID(),
        ownerId: "",
        url,
        type: "image",
        caption: prompt || null,
        isAiImage: true,
        createdAt: new Date().toISOString(),
      },
      ...i,
    ]);
  }

  async function handleRemove(id: string) {
    await mediaApi.remove(id);
    setItems((i) => i.filter((item) => item.id !== id));
  }

  return (
    <div className="rounded-xl border border-white/10 bg-black/20 p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-white/60">Portfolio</h2>
        {isOwner && (
          <button
            onClick={() => fileInputRef.current?.click()}
            className="text-xs text-[var(--profile-accent)] hover:underline"
          >
            + Upload
          </button>
        )}
        <input ref={fileInputRef} type="file" accept="image/*,audio/mpeg" className="hidden" onChange={handleFileChange} />
      </div>

      {isOwner && (
        <div className="mt-2 flex items-center gap-2">
          <input
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Describe an image to generate…"
            className="flex-1 rounded-md border border-white/10 bg-black/30 px-2 py-1 text-xs text-white placeholder:text-white/30 focus:border-[var(--profile-accent)] focus:outline-none"
          />
          <GenerateImageButton kind="post" getPrompt={() => prompt} onGenerated={handleAiGenerated} label="Generate" />
        </div>
      )}

      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
        {items.length === 0 && <p className="col-span-3 text-xs text-white/40">No portfolio pieces yet.</p>}
        {items.map((item) => (
          <div key={item.id} className="group relative overflow-hidden rounded-lg border border-white/10">
            {item.type === "audio" ? (
              <audio controls src={assetUrl(item.url)} className="w-full" />
            ) : (
              <img src={assetUrl(item.url)} alt={item.caption ?? ""} className="aspect-square w-full object-cover" />
            )}
            {item.isAiImage && (
              <span className="absolute left-1 top-1 rounded-full bg-fuchsia-500/80 px-1.5 py-0.5 text-[9px] font-medium text-white">
                AI
              </span>
            )}
            {isOwner && (
              <button
                onClick={() => handleRemove(item.id)}
                className="absolute right-1 top-1 rounded-full bg-black/70 px-1.5 py-0.5 text-[10px] text-white opacity-0 group-hover:opacity-100"
              >
                ✕
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
