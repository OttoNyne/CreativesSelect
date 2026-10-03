import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { WallpaperStudio } from "./WallpaperStudio";
import { aiApi } from "../../api/ai.api";
import { ApiError } from "../../api/client";
import type { WallpaperMotion } from "../../types";

vi.mock("../../api/ai.api", () => ({ aiApi: { generateWallpaper: vi.fn(), discard: vi.fn() } }));
vi.mock("../../lib/resizeImage", () => ({ shrinkForUpload: vi.fn(async (f: File) => new Blob([`small-${f.name}`], { type: "image/jpeg" })) }));
const api = vi.mocked(aiApi);

const URL_A = "https://res.cloudinary.com/demo/image/upload/creativeselect/ai-generated/a.jpg";
const URL_B = "https://res.cloudinary.com/demo/image/upload/creativeselect/ai-generated/b.jpg";

function setup(over: Partial<React.ComponentProps<typeof WallpaperStudio>> = {}) {
  const props = {
    hasWallpaper: false,
    isPicture: true,
    motion: "none" as WallpaperMotion,
    onMotionChange: vi.fn(),
    onUse: vi.fn<(url: string, motion: WallpaperMotion) => Promise<void>>(async () => {}),
    ...over,
  };
  const view = render(<WallpaperStudio {...props} />);
  return { ...props, ...view };
}
const describeIt = (text: string) => userEvent.type(screen.getByLabelText(/What should it look like/), text);
const photo = (name = "harbor.jpg") => new File(["x"], name, { type: "image/jpeg" });

beforeEach(() => {
  Object.values(api).forEach((fn) => fn.mockReset());
  api.generateWallpaper.mockResolvedValue({ url: URL_A, usedReference: false });
  api.discard.mockResolvedValue(undefined);
  vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: vi.fn(() => "blob:preview"), revokeObjectURL: vi.fn() }));
});

describe("WallpaperStudio: from a description", () => {
  it("needs a description before it will generate", async () => {
    setup();
    const generate = screen.getByRole("button", { name: /Generate live wallpaper/ });
    expect(generate).toBeDisabled();
    await describeIt("a rainy neon street");
    expect(generate).toBeEnabled();
  });

  it("generates from the description alone and shows the result, which isn't used until chosen", async () => {
    const { onUse } = setup();
    await describeIt("a rainy neon street");
    await userEvent.click(screen.getByRole("button", { name: /Generate live wallpaper/ }));
    expect(api.generateWallpaper).toHaveBeenCalledWith({ prompt: "a rainy neon street", reference: undefined, closeness: "balanced" });
    expect(await screen.findByRole("img", { name: "Your new wallpaper" })).toHaveAttribute("src", URL_A);
    expect(screen.getByText(/Made from your description\./)).toBeInTheDocument();
    expect(onUse).not.toHaveBeenCalled();
  });

  it("shows the result moving, with the chosen motion, before it is used", async () => {
    setup();
    await describeIt("harbor");
    await userEvent.click(screen.getByRole("radio", { name: "Pan" }));
    await userEvent.click(screen.getByRole("button", { name: /Generate live wallpaper/ }));
    await screen.findByRole("img", { name: "Your new wallpaper" });
    expect(screen.getByTestId("moving-wallpaper")).toHaveAttribute("data-motion", "pan");
  });

  it("starts with a motion chosen, since a live wallpaper is the point", () => {
    setup();
    expect(screen.getByRole("radio", { name: "Slow zoom" })).toBeChecked();
  });

  it("shows a still result as a plain picture when Still is chosen", async () => {
    setup();
    await describeIt("harbor");
    await userEvent.click(screen.getByRole("radio", { name: "Still" }));
    await userEvent.click(screen.getByRole("button", { name: /Generate live wallpaper/ }));
    await screen.findByRole("img", { name: "Your new wallpaper" });
    expect(screen.queryByTestId("moving-wallpaper")).not.toBeInTheDocument();
  });

  it("uses the result, with the chosen motion, when asked", async () => {
    const { onUse } = setup();
    await describeIt("harbor");
    await userEvent.click(screen.getByRole("radio", { name: "Drift" }));
    await userEvent.click(screen.getByRole("button", { name: /Generate live wallpaper/ }));
    await userEvent.click(await screen.findByRole("button", { name: "Use this wallpaper" }));
    expect(onUse).toHaveBeenCalledWith(URL_A, "drift");
    await waitFor(() => expect(screen.queryByRole("img", { name: "Your new wallpaper" })).not.toBeInTheDocument());
    expect(api.discard).not.toHaveBeenCalled(); // it is the wallpaper now
  });

  it("keeps the result and says so if it couldn't be saved", async () => {
    const { onUse } = setup();
    vi.mocked(onUse).mockRejectedValue(new Error("nope"));
    await describeIt("harbor");
    await userEvent.click(screen.getByRole("button", { name: /Generate live wallpaper/ }));
    await userEvent.click(await screen.findByRole("button", { name: "Use this wallpaper" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't save that wallpaper");
    expect(screen.getByRole("img", { name: "Your new wallpaper" })).toBeInTheDocument();
  });

  it("removes a picture that wasn't used when it is discarded or replaced", async () => {
    setup();
    await describeIt("harbor");
    await userEvent.click(screen.getByRole("button", { name: /Generate live wallpaper/ }));
    await screen.findByRole("img", { name: "Your new wallpaper" });
    api.generateWallpaper.mockResolvedValue({ url: URL_B, usedReference: false });
    await userEvent.click(screen.getByRole("button", { name: "✨ Try again" }));
    expect(api.discard).toHaveBeenCalledWith(URL_A);
    await screen.findByRole("img", { name: "Your new wallpaper" });
    await userEvent.click(screen.getByRole("button", { name: "Discard" }));
    expect(api.discard).toHaveBeenCalledWith(URL_B);
    expect(screen.queryByRole("img", { name: "Your new wallpaper" })).not.toBeInTheDocument();
  });

  it("removes an unused picture if the editor is closed", async () => {
    const { unmount } = setup();
    await describeIt("harbor");
    await userEvent.click(screen.getByRole("button", { name: /Generate live wallpaper/ }));
    await screen.findByRole("img", { name: "Your new wallpaper" });
    unmount();
    expect(api.discard).toHaveBeenCalledWith(URL_A);
  });

  it("shows the server's reason when it can't make one", async () => {
    api.generateWallpaper.mockRejectedValue(new ApiError(429, "Wallpaper limit reached (6 per hour) — try again later"));
    setup();
    await describeIt("harbor");
    await userEvent.click(screen.getByRole("button", { name: /Generate live wallpaper/ }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Wallpaper limit reached");
    expect(screen.getByRole("button", { name: /Generate live wallpaper/ })).toBeEnabled();
  });

  it("says it is working, and can't be started twice", async () => {
    let finish: (v: { url: string; usedReference: boolean }) => void = () => {};
    api.generateWallpaper.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    setup();
    await describeIt("harbor");
    await userEvent.click(screen.getByRole("button", { name: /Generate live wallpaper/ }));
    expect(screen.getByRole("button", { name: "Creating your wallpaper…" })).toBeDisabled();
    expect(screen.getByRole("status")).toHaveTextContent("up to a minute");
    finish({ url: URL_A, usedReference: false });
    await screen.findByRole("img", { name: "Your new wallpaper" });
  });
});

describe("WallpaperStudio: with a reference photo", () => {
  async function addPhoto(file = photo()) {
    await userEvent.upload(screen.getByLabelText("Reference photo"), file);
  }

  it("is optional: there is no way-of-following choice until a photo is added", async () => {
    setup();
    expect(screen.queryByText(/How closely should it follow/)).not.toBeInTheDocument();
    await addPhoto();
    expect(screen.getByText(/How closely should it follow/)).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Your reference photo" })).toBeInTheDocument();
  });

  it("sends the photo (shrunk) and how closely to follow it", async () => {
    api.generateWallpaper.mockResolvedValue({ url: URL_A, usedReference: true });
    setup();
    await addPhoto(photo("harbor.jpg"));
    await userEvent.click(screen.getByRole("radio", { name: "Just inspired by it" }));
    await describeIt("turn it into a painting");
    await userEvent.click(screen.getByRole("button", { name: /Generate live wallpaper/ }));
    const sent = api.generateWallpaper.mock.calls[0][0];
    expect(sent).toMatchObject({ prompt: "turn it into a painting", closeness: "loose" });
    expect(await (sent.reference as Blob).text()).toBe("small-harbor.jpg");
    expect(await screen.findByText(/Made from your photo and description\./)).toBeInTheDocument();
  });

  it("can drop the photo again", async () => {
    setup();
    await addPhoto();
    await userEvent.click(screen.getByRole("button", { name: "Remove photo" }));
    expect(screen.queryByRole("img", { name: "Your reference photo" })).not.toBeInTheDocument();
    await describeIt("harbor");
    await userEvent.click(screen.getByRole("button", { name: /Generate live wallpaper/ }));
    expect(api.generateWallpaper.mock.calls[0][0].reference).toBeUndefined();
  });

  it("won't take a file that isn't a picture", async () => {
    setup();
    await userEvent.upload(screen.getByLabelText("Reference photo"), new File(["x"], "notes.txt", { type: "text/plain" }), { applyAccept: false });
    expect(await screen.findByRole("alert")).toHaveTextContent("Choose a picture");
    expect(screen.queryByRole("img", { name: "Your reference photo" })).not.toBeInTheDocument();
  });
});

describe("WallpaperStudio: the motion of the wallpaper already there", () => {
  it("shows the current motion and changes it straight away", async () => {
    const { onMotionChange } = setup({ hasWallpaper: true, motion: "pan" });
    expect(screen.getByRole("radio", { name: "Pan" })).toBeChecked();
    expect(screen.getByText(/changes your current wallpaper straight away/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("radio", { name: "Pulse" }));
    expect(onMotionChange).toHaveBeenCalledWith("pulse");
  });

  it("doesn't change the profile when choosing the motion for a picture that is waiting to be used", async () => {
    const { onMotionChange } = setup({ hasWallpaper: true, motion: "pan" });
    await describeIt("harbor");
    await userEvent.click(screen.getByRole("button", { name: /Generate live wallpaper/ }));
    await screen.findByRole("img", { name: "Your new wallpaper" });
    await userEvent.click(screen.getByRole("radio", { name: "Slow zoom" }));
    expect(onMotionChange).not.toHaveBeenCalled();
    expect(screen.getByTestId("moving-wallpaper")).toHaveAttribute("data-motion", "zoom");
  });

  it("doesn't change a video wallpaper, which plays by itself", async () => {
    const { onMotionChange } = setup({ hasWallpaper: true, isPicture: false, motion: "none" });
    await userEvent.click(screen.getByRole("radio", { name: "Drift" }));
    expect(onMotionChange).not.toHaveBeenCalled();
    expect(screen.queryByText(/straight away/)).not.toBeInTheDocument();
  });
});
