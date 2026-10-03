import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { GenerateImageButton } from "./GenerateImageButton";
import { aiApi } from "../../api/ai.api";
import { ApiError } from "../../api/client";

vi.mock("../../api/ai.api", () => ({ aiApi: { generateImage: vi.fn() } }));
vi.mock("../../lib/resizeImage", () => ({ shrinkForUpload: vi.fn(async (f: File) => new Blob([`small-${f.name}`], { type: "image/jpeg" })) }));
const generateImage = vi.mocked(aiApi.generateImage);

const generate = () => screen.getByRole("button", { name: /Generate|Painting|Reworking/ });
const photo = (name = "kite.jpg") => new File(["x"], name, { type: "image/jpeg" });

beforeEach(() => {
  generateImage.mockReset();
  vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: vi.fn(() => "blob:preview"), revokeObjectURL: vi.fn() }));
});

describe("GenerateImageButton", () => {
  it("is disabled, with a hint, until there is a prompt", () => {
    render(<GenerateImageButton kind="post" getPrompt={() => "  "} onGenerated={() => {}} />);
    expect(generate()).toBeDisabled();
    expect(generate()).toHaveAttribute("title", "Type a description first");
  });

  it("generates from the prompt and hands back the URL", async () => {
    generateImage.mockResolvedValue({ url: "https://cdn.example.com/fox.jpg" });
    const onGenerated = vi.fn();
    render(<GenerateImageButton kind="wallpaper" getPrompt={() => "red fox"} onGenerated={onGenerated} />);

    await userEvent.click(generate());

    expect(generateImage).toHaveBeenCalledWith("red fox", "wallpaper"); // exactly as before when there is no photo
    await waitFor(() => expect(onGenerated).toHaveBeenCalledWith("https://cdn.example.com/fox.jpg"));
  });

  it("shows the server's message when generation fails", async () => {
    generateImage.mockRejectedValue(new ApiError(429, "Image limit reached (10 per hour) — try again later"));
    const onGenerated = vi.fn();
    render(<GenerateImageButton kind="post" getPrompt={() => "red fox"} onGenerated={onGenerated} />);

    await userEvent.click(generate());

    expect(await screen.findByText(/Image limit reached/)).toBeInTheDocument();
    expect(onGenerated).not.toHaveBeenCalled();
    expect(generate()).toBeEnabled();
  });

  it("falls back to a generic message for unexpected errors", async () => {
    generateImage.mockRejectedValue(new TypeError("Failed to fetch"));
    render(<GenerateImageButton kind="post" getPrompt={() => "red fox"} onGenerated={() => {}} />);
    await userEvent.click(generate());
    expect(await screen.findByText("Couldn't generate an image, try again.")).toBeInTheDocument();
  });
});

describe("GenerateImageButton: starting from a reference photo", () => {
  async function addPhoto(file = photo()) {
    await userEvent.click(screen.getByRole("button", { name: "📷 Start from a photo" }));
    await userEvent.upload(screen.getByLabelText("Reference photo"), file);
  }

  it("keeps the photo option out of the way until it is asked for", async () => {
    render(<GenerateImageButton kind="post" getPrompt={() => "a kite"} onGenerated={() => {}} />);
    expect(screen.queryByLabelText("Reference photo")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "📷 Start from a photo" }));
    expect(screen.getByLabelText("Reference photo")).toBeInTheDocument();
    expect(screen.queryByText(/How closely should it follow/)).not.toBeInTheDocument(); // not until there is a photo
  });

  it("sends the photo (shrunk) and how closely to follow it with the description", async () => {
    generateImage.mockResolvedValue({ url: "https://cdn.example.com/kite.jpg" });
    const onGenerated = vi.fn();
    render(<GenerateImageButton kind="post" getPrompt={() => "a kite"} onGenerated={onGenerated} />);
    await addPhoto(photo("kite.jpg"));
    expect(screen.getByRole("img", { name: "Your reference photo" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("radio", { name: "Stay close to my photo" }));

    await userEvent.click(generate());

    const [prompt, kind, options] = generateImage.mock.calls[0];
    expect([prompt, kind]).toEqual(["a kite", "post"]);
    expect(options?.closeness).toBe("close");
    expect(await (options!.reference as Blob).text()).toBe("small-kite.jpg");
    await waitFor(() => expect(onGenerated).toHaveBeenCalledWith("https://cdn.example.com/kite.jpg"));
  });

  it("says it is reworking the photo while it waits, and can't be started twice", async () => {
    let finish: (v: { url: string }) => void = () => {};
    generateImage.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    render(<GenerateImageButton kind="avatar" getPrompt={() => "a kite"} onGenerated={() => {}} />);
    await addPhoto();
    await userEvent.click(generate());
    expect(await screen.findByRole("button", { name: /Reworking your photo/ })).toBeDisabled();
    finish({ url: "https://cdn.example.com/a.jpg" });
    await waitFor(() => expect(generate()).toBeEnabled());
  });

  it("goes back to drawing from words alone when the photo is removed", async () => {
    generateImage.mockResolvedValue({ url: "https://cdn.example.com/kite.jpg" });
    render(<GenerateImageButton kind="post" getPrompt={() => "a kite"} onGenerated={() => {}} />);
    await addPhoto();
    await userEvent.click(screen.getByRole("button", { name: "Remove photo" }));
    await userEvent.click(generate());
    expect(generateImage).toHaveBeenCalledWith("a kite", "post");
  });

  it("keeps the photo and shows the reason if it fails, so it can be tried again", async () => {
    generateImage.mockRejectedValueOnce(new ApiError(502, "Image generation failed, try again"));
    generateImage.mockResolvedValueOnce({ url: "https://cdn.example.com/kite.jpg" });
    const onGenerated = vi.fn();
    render(<GenerateImageButton kind="post" getPrompt={() => "a kite"} onGenerated={onGenerated} />);
    await addPhoto();
    await userEvent.click(generate());
    expect(await screen.findByText("Image generation failed, try again")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Your reference photo" })).toBeInTheDocument();
    await userEvent.click(generate());
    await waitFor(() => expect(onGenerated).toHaveBeenCalled());
    expect(generateImage.mock.calls[1][2]?.reference).toBeDefined();
  });

  it("won't take a file that isn't a picture", async () => {
    render(<GenerateImageButton kind="post" getPrompt={() => "a kite"} onGenerated={() => {}} />);
    await userEvent.click(screen.getByRole("button", { name: "📷 Start from a photo" }));
    await userEvent.upload(screen.getByLabelText("Reference photo"), new File(["x"], "notes.txt", { type: "text/plain" }), { applyAccept: false });
    expect(await screen.findByRole("alert")).toHaveTextContent("Choose a picture");
    expect(screen.queryByRole("img", { name: "Your reference photo" })).not.toBeInTheDocument();
  });
});
