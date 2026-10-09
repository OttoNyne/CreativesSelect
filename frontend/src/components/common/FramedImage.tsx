import { aspectRatioCss, type ImageAspect } from "../../lib/framing";

// A picture shown the way its author framed it. Left as it was ("original"), the whole picture shows, however tall or wide; only a shape
// the author chose (square, 4:3, wide) or a zoom crops it.
//  The same component is used for the preview while
// composing and for the finished post, so what they set is what everyone sees.
export function FramedImage({
  src,
  aspect = "original",
  zoom = 1,
  position = "50% 50%",
  className = "",
  alt = "",
}: {
  src?: string;
  aspect?: ImageAspect;
  zoom?: number;
  position?: string;
  className?: string;
  alt?: string;
}) {
  const shaped = aspect !== "original";
  return (
    <div className={`overflow-hidden ${shaped ? "" : "bg-black/20"} ${className}`} style={shaped ? { aspectRatio: aspectRatioCss(aspect) } : undefined}>
      <img
        src={src}
        alt={alt}
        draggable={false}
        className={shaped ? "h-full w-full object-cover" : "block max-h-[75vh] w-full object-contain"}
        style={{ objectPosition: position, transformOrigin: position, transform: zoom !== 1 ? `scale(${zoom})` : undefined }}
      />
    </div>
  );
}
