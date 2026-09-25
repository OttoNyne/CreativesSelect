import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { GenerateTextButton } from "./GenerateTextButton";
import { aiApi } from "../../api/ai.api";
import { ApiError } from "../../api/client";

vi.mock("../../api/ai.api", () => ({ aiApi: { generateText: vi.fn() } }));
const generateText = vi.mocked(aiApi.generateText);

beforeEach(() => {
  generateText.mockReset();
});

describe("GenerateTextButton", () => {
  it("is disabled, with a hint, until there is something to base the text on", () => {
    render(<GenerateTextButton kind="bio" getPrompt={() => "  "} onGenerated={() => {}} />);
    const button = screen.getByRole("button");
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("title", "Type something first");
  });

  it("generates from the prompt and hands back the text", async () => {
    generateText.mockResolvedValue({ text: "Potter and dreamer" });
    const onGenerated = vi.fn();
    render(<GenerateTextButton kind="bio" getPrompt={() => "pottery"} onGenerated={onGenerated} />);
    await userEvent.click(screen.getByRole("button"));

    expect(generateText).toHaveBeenCalledWith("pottery", "bio");
    await waitFor(() => expect(onGenerated).toHaveBeenCalledWith("Potter and dreamer"));
  });

  it("shows the server's message when generation fails (e.g. the hourly limit)", async () => {
    generateText.mockRejectedValue(new ApiError(429, "Text limit reached (30 per hour) — try again later"));
    const onGenerated = vi.fn();
    render(<GenerateTextButton kind="caption" getPrompt={() => "sunset"} onGenerated={onGenerated} />);
    await userEvent.click(screen.getByRole("button"));

    expect(await screen.findByText(/Text limit reached/)).toBeInTheDocument();
    expect(onGenerated).not.toHaveBeenCalled();
    expect(screen.getByRole("button")).toBeEnabled();
  });

  it("falls back to a generic message for unexpected errors", async () => {
    generateText.mockRejectedValue(new TypeError("Failed to fetch"));
    render(<GenerateTextButton kind="blurb" getPrompt={() => "an EP"} onGenerated={() => {}} />);
    await userEvent.click(screen.getByRole("button"));
    expect(await screen.findByText("Couldn't generate text, try again.")).toBeInTheDocument();
  });

  it("uses the label it's given", () => {
    render(<GenerateTextButton kind="bio" getPrompt={() => "x"} onGenerated={() => {}} label="Write my bio" />);
    expect(screen.getByRole("button", { name: /Write my bio/ })).toBeInTheDocument();
  });
});
