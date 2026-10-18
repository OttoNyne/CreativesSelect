import type { ReactNode } from "react";

/**
 * Shapes that stand in for content while it loads, so the page keeps its layout and feels alive instead of showing the word "Loading…" on
 * an empty screen. The shimmer is plain CSS (see .cs-skeleton in index.css) and stops for people who ask their device for less motion.
 * Everything here is hidden from screen readers; the one wrapper, LoadingBlock, tells them what is loading.
 */

/** One block: a line, a picture or a circle. Give it a size with Tailwind classes (h-4 w-1/2, size-10 rounded-full ...). */
export function Skeleton({ className = "" }: { className?: string }) {
  return <div aria-hidden="true" className={`cs-skeleton ${className}`} />;
}

/** Lines of text of different lengths. */
export function SkeletonLines({ lines = 3, className = "" }: { lines?: number; className?: string }) {
  const widths = ["w-full", "w-11/12", "w-4/5", "w-3/5"];
  return (
    <div aria-hidden="true" className={`space-y-2 ${className}`}>
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton key={i} className={`h-3.5 ${widths[i % widths.length]}`} />
      ))}
    </div>
  );
}

/**
 * The wrapper for something that is loading: announced to screen readers as loading, named `label` (the same words the page used to show),
 * and marked busy. It is a progress indicator with no value (an indeterminate progress bar), not a status message, so it never gets mixed up with a
 * real success or error message on the same page. The shapes inside are for the eyes only.
 */
export function LoadingBlock({ label, children, className = "" }: { label: string; children: ReactNode; className?: string }) {
  return (
    <div role="progressbar" aria-busy="true" aria-label={label} className={className}>
      <span className="sr-only">{label}</span>
      {children}
    </div>
  );
}

/** A post: who wrote it, a few lines, and the row of buttons. */
export function PostSkeleton() {
  return (
    <div aria-hidden="true" className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
      <div className="flex items-center gap-3">
        <Skeleton className="size-10 rounded-full" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-3.5 w-1/3" />
          <Skeleton className="h-3 w-1/4" />
        </div>
      </div>
      <SkeletonLines lines={3} className="mt-4" />
      <div className="mt-4 flex gap-2">
        <Skeleton className="h-6 w-14 rounded-full" />
        <Skeleton className="h-6 w-14 rounded-full" />
      </div>
    </div>
  );
}

/** A list of posts. */
export function FeedSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div aria-hidden="true" className="space-y-4">
      {Array.from({ length: count }, (_, i) => (
        <PostSkeleton key={i} />
      ))}
    </div>
  );
}

/** A card in a list (a call, a request, an event): a picture or mark, a title line and two short lines. */
export function CardSkeleton() {
  return (
    <div aria-hidden="true" className="flex gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-4">
      <Skeleton className="size-20 shrink-0 rounded-md" />
      <div className="flex-1 space-y-2.5">
        <Skeleton className="h-3 w-1/3" />
        <Skeleton className="h-4 w-4/5" />
        <Skeleton className="h-3 w-1/2" />
      </div>
    </div>
  );
}

export function CardListSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div aria-hidden="true" className="space-y-3">
      {Array.from({ length: count }, (_, i) => (
        <CardSkeleton key={i} />
      ))}
    </div>
  );
}

/** A profile: the picture and name, then the first panels. */
export function ProfileSkeleton() {
  return (
    <div aria-hidden="true" className="mx-auto max-w-3xl px-4 pt-8">
      <div className="flex items-end gap-4">
        <Skeleton className="size-24 shrink-0 rounded-full" />
        <div className="flex-1 space-y-2.5 pb-1">
          <Skeleton className="h-6 w-1/2" />
          <Skeleton className="h-3.5 w-1/3" />
          <Skeleton className="h-3.5 w-2/5" />
        </div>
      </div>
      <SkeletonLines lines={2} className="mt-6" />
      <div className="mt-8 space-y-4">
        {[0, 1].map((i) => (
          <div key={i} className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
            <Skeleton className="h-3.5 w-24" />
            <div className="mt-4 grid grid-cols-3 gap-2">
              <Skeleton className="aspect-square" />
              <Skeleton className="aspect-square" />
              <Skeleton className="aspect-square" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
