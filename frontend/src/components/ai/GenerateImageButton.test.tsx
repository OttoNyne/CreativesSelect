import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { GenerateImageButton } from "./GenerateImageButton";
import { aiApi } from "../../api/ai.api";
import { ApiError } from "../../api/client";

vi.mock("../../api/ai.api", () => ({ aiApi: { generateImage: vi.fn() } }));
const generateImage = vi.mocked(aiApi.generateImage);

beforeEach(() => {
  generateImage.mockReset();
});

describe("GenerateImageButton", () => {
  it("is disabled, with a hint, until there is a prompt", () => {
    render(<GenerateImageButton kind="post" getPrompt={() => "  "} onGenerated={() => {}} />);
    const button = screen.getByRole("button");
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("title", "Type a description first");
  });

  it("generates from the prompt and hands back the URL", async () => {
    generateImage.mockResolvedValue({ url: "https://cdn.example.com/fox.jpg" });
    const onGenerated = vi.fn();
    render(<GenerateImageButton kind="wallpaper" getPrompt={() => "red fox"} onGenerated={onGenerated} />);

    await userEvent.click(screen.getByRole("button"));

    expect(generateImage).toHaveBeenCalledWith("red fox", "wallpaper");
    await waitFor(() => expect(onGenerated).toHaveBeenCalledWith("https://cdn.example.com/fox.jpg"));
  });

  it("shows the server's message when generation fails", async () => {
    generateImage.mockRejectedValue(new ApiError(429, "Image limit reached (10 per hour) — try again later"));
    const onGenerated = vi.fn();
    render(<GenerateImageButton kind="post" getPrompt={() => "red fox"} onGenerated={onGenerated} />);

    await userEvent.click(screen.getByRole("button"));

    expect(await screen.findByText(/Image limit reached/)).toBeInTheDocument();
    expect(onGenerated).not.toHaveBeenCalled();
    expect(screen.getByRole("button")).toBeEnabled();
  });

  it("falls back to a generic message for unexpected errors", async () => {
    generateImage.mockRejectedValue(new TypeError("Failed to fetch"));
    render(<GenerateImageButton kind="post" getPrompt={() => "red fox"} onGenerated={() => {}} />);
    await userEvent.click(screen.getByRole("button"));
    expect(await screen.findByText("Couldn't generate an image, try again.")).toBeInTheDocument();
  });
});
