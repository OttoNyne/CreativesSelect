import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Linkified } from "./Linkified";
import { CommentPicture } from "./CommentPicture";
import { CommentPicturePicker, MAX_COMMENT_PICTURE_BYTES } from "./CommentPicturePicker";
import { CommentThread } from "./CommentThread";
import { uploadFile } from "../../api/media.api";
import { aiApi } from "../../api/ai.api";
import { ApiError } from "../../api/client";
import { useAuth } from "../../context/AuthContext";
import type { Comment, User } from "../../types";

vi.mock("../../api/media.api", () => ({ uploadFile: vi.fn() }));
vi.mock("../../api/ai.api", () => ({ aiApi: { discard: vi.fn() } }));
vi.mock("../../context/AuthContext", () => ({ useAuth: vi.fn() }));

const person = (id: string, name: string) => ({ id, username: name.toLowerCase(), displayName: name }) as User;
const comment = (id: string, authorId: string, name: string, content: string, over: Partial<Comment> = {}): Comment => ({ id, content, createdAt: "", author: person(authorId, name), ...over }) as Comment;
const PICTURE = "https://res.cloudinary.example/image/upload/v1/creativeselect/comments/a.png";
const file = (name = "pic.png", type = "image/png", size = 100) => {
  const f = new File(["x"], name, { type });
  Object.defineProperty(f, "size", { value: size });
  return f;
};

beforeEach(() => {
  vi.mocked(uploadFile).mockReset();
  vi.mocked(aiApi.discard).mockReset();
  vi.mocked(aiApi.discard).mockResolvedValue(undefined);
  vi.mocked(useAuth).mockReturnValue({ user: person("me", "Me"), isLoading: false, setUser: () => {}, refresh: async () => {} });
});

describe("Linkified", () => {
  it("draws an address as a link that opens safely in a new tab, and everything else as text", () => {
    render(
      <p>
        <Linkified text={"Look at https://example.com/work, <b>wow</b>"} />
      </p>
    );
    const link = screen.getByRole("link", { name: "example.com/work" });
    expect(link).toHaveAttribute("href", "https://example.com/work");
    expect(link).toHaveAttribute("target", "_blank");
    for (const word of ["noopener", "noreferrer", "nofollow", "ugc"]) expect(link.getAttribute("rel")).toContain(word);
    expect(link).toHaveAttribute("title", "https://example.com/work");
    expect(screen.getByText(/<b>wow<\/b>/)).toBeInTheDocument();
    expect(document.querySelector("p b")).toBeNull();
  });

  it("shows an address with a name and password, or a script address, as plain text", () => {
    render(
      <p>
        <Linkified text={"https://paypal.com@evil.example.com/ javascript:alert(1)"} />
      </p>
    );
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(screen.getByText(/paypal\.com@evil/)).toBeInTheDocument();
  });
});

describe("CommentPicture", () => {
  it("shows the picture at a modest size, opening full size in a new tab", () => {
    render(<CommentPicture url={PICTURE} />);
    expect(screen.getByRole("img", { name: "Picture in a comment" })).toHaveAttribute("src", PICTURE);
    expect(screen.getByRole("link")).toHaveAttribute("href", PICTURE);
    expect(screen.getByRole("link")).toHaveAttribute("target", "_blank");
  });
});

describe("CommentPicturePicker", () => {
  const choose = (f: File) => fireEvent.change(screen.getByLabelText("Choose a picture for your comment"), { target: { files: [f] } });

  it("uploads the chosen picture for comments, shows a preview, and hands over its address", async () => {
    vi.mocked(uploadFile).mockResolvedValue({ url: PICTURE });
    const onChange = vi.fn();
    render(<CommentPicturePicker url={null} onChange={onChange} />);
    choose(file());
    await waitFor(() => expect(onChange).toHaveBeenCalledWith(PICTURE));
    expect(uploadFile).toHaveBeenCalledWith(expect.any(File), "comments");
  });

  it("shows the preview and a way to remove it, which also removes the stored file", async () => {
    const onChange = vi.fn();
    render(<CommentPicturePicker url={PICTURE} onChange={onChange} />);
    expect(screen.getByRole("img", { name: "Picture to post with your comment" })).toHaveAttribute("src", PICTURE);
    await userEvent.click(screen.getByRole("button", { name: "Remove picture" }));
    expect(onChange).toHaveBeenCalledWith(null);
    expect(aiApi.discard).toHaveBeenCalledWith(PICTURE);
  });

  it("takes pictures and GIFs only, and nothing over 5 MB, without uploading", async () => {
    const onChange = vi.fn();
    render(<CommentPicturePicker url={null} onChange={onChange} />);
    choose(file("clip.mp4", "video/mp4"));
    expect(await screen.findByRole("alert")).toHaveTextContent(/PNG, JPEG, WebP or GIF/);
    choose(file("vector.svg", "image/svg+xml"));
    expect(screen.getByRole("alert")).toHaveTextContent(/PNG, JPEG, WebP or GIF/);
    choose(file("huge.png", "image/png", MAX_COMMENT_PICTURE_BYTES + 1));
    expect(await screen.findByText("Pictures in comments can be up to 5 MB.")).toBeInTheDocument();
    expect(uploadFile).not.toHaveBeenCalled();
    choose(file("anim.gif", "image/gif"));
    await waitFor(() => expect(uploadFile).toHaveBeenCalledTimes(1));
  });

  it("shows the server's reason if the upload fails", async () => {
    vi.mocked(uploadFile).mockRejectedValue(new ApiError(429, "You've added a lot of pictures to comments — try again in a while."));
    const onChange = vi.fn();
    render(<CommentPicturePicker url={null} onChange={onChange} />);
    choose(file());
    expect(await screen.findByRole("alert")).toHaveTextContent("try again in a while");
    expect(onChange).toHaveBeenLastCalledWith(null);
  });

  it("removes the old stored file when a picture is replaced before posting", async () => {
    vi.mocked(uploadFile).mockResolvedValue({ url: "https://res.cloudinary.example/image/upload/b.png" });
    const onChange = vi.fn();
    render(<CommentPicturePicker url={PICTURE} onChange={onChange} />);
    // the file input is there even while a picture is showing, for replacing it
    choose(file());
    await waitFor(() => expect(onChange).toHaveBeenCalledWith("https://res.cloudinary.example/image/upload/b.png"));
    expect(aiApi.discard).toHaveBeenCalledWith(PICTURE);
  });
});

describe("CommentThread: pictures and links in comments", () => {
  function thread(over: Partial<React.ComponentProps<typeof CommentThread>> = {}) {
    const props = {
      threadKey: "t",
      load: vi.fn().mockResolvedValue({ comments: [] }),
      add: vi.fn(),
      update: vi.fn(),
      onCountChange: vi.fn(),
      ...over,
    };
    render(<CommentThread {...props} />);
    return props;
  }

  it("shows a comment's picture and turns its links into links", async () => {
    thread({ load: vi.fn().mockResolvedValue({ comments: [comment("c1", "u-zoe", "Zoe", "Made this: https://example.com/x", { imageUrl: PICTURE })] }) });
    expect(await screen.findByRole("link", { name: "example.com/x" })).toHaveAttribute("href", "https://example.com/x");
    expect(screen.getByRole("img", { name: "Picture in a comment" })).toHaveAttribute("src", PICTURE);
  });

  it("shows a picture-only comment without empty words", async () => {
    thread({ load: vi.fn().mockResolvedValue({ comments: [comment("c1", "u-zoe", "Zoe", "", { imageUrl: PICTURE })] }) });
    expect(await screen.findByRole("img", { name: "Picture in a comment" })).toBeInTheDocument();
    expect(screen.getByText("Zoe")).toBeInTheDocument();
  });

  it("posts a comment with a picture, and a picture on its own", async () => {
    vi.mocked(uploadFile).mockResolvedValue({ url: PICTURE });
    const add = vi.fn().mockResolvedValue({ comment: comment("c9", "me", "Me", "Nice", { imageUrl: PICTURE }) });
    const props = thread({ add });
    await screen.findByText("No comments yet.");
    fireEvent.change(screen.getByLabelText("Choose a picture for your comment"), { target: { files: [file()] } });
    await screen.findByRole("img", { name: "Picture to post with your comment" });
    await userEvent.type(screen.getByPlaceholderText("Write a comment…"), "Nice");
    await userEvent.click(screen.getByRole("button", { name: "Post" }));
    expect(add).toHaveBeenCalledWith("Nice", PICTURE);
    expect(await screen.findByRole("img", { name: "Picture in a comment" })).toBeInTheDocument();
    expect(screen.queryByRole("img", { name: "Picture to post with your comment" })).not.toBeInTheDocument(); // the box is clear again
    expect(vi.mocked(props.onCountChange).mock.calls[0][0](0)).toBe(1);

    add.mockResolvedValue({ comment: comment("c10", "me", "Me", "", { imageUrl: PICTURE }) });
    fireEvent.change(screen.getByLabelText("Choose a picture for your comment"), { target: { files: [file()] } });
    await screen.findByRole("img", { name: "Picture to post with your comment" });
    await userEvent.click(screen.getByRole("button", { name: "Post" })); // no words, just the picture
    expect(add).toHaveBeenLastCalledWith("", PICTURE);
  });

  it("posts nothing when there are neither words nor a picture", async () => {
    const props = thread();
    await screen.findByText("No comments yet.");
    await userEvent.click(screen.getByRole("button", { name: "Post" }));
    expect(props.add).not.toHaveBeenCalled();
  });

  it("lets the author take a picture off their comment, keeping the words, and nobody else", async () => {
    const removePicture = vi.fn().mockResolvedValue({ comment: comment("c2", "me", "Me", "My words", { imageUrl: null }) });
    thread({
      removePicture,
      load: vi.fn().mockResolvedValue({ comments: [comment("c1", "u-zoe", "Zoe", "Hers", { imageUrl: PICTURE }), comment("c2", "me", "Me", "My words", { imageUrl: PICTURE })] }),
    });
    await screen.findByText("My words");
    expect(screen.getAllByRole("button", { name: /^Remove the picture from your comment/ })).toHaveLength(1);
    await userEvent.click(screen.getByRole("button", { name: /^Remove the picture from your comment/ }));
    expect(removePicture).toHaveBeenCalledWith("c2");
    await waitFor(() => expect(screen.getAllByRole("img", { name: "Picture in a comment" })).toHaveLength(1));
    expect(screen.getByText("My words")).toBeInTheDocument();
  });

  it("shows the server's reason if posting is refused", async () => {
    thread({ add: vi.fn().mockRejectedValue(new ApiError(400, "Comments can have up to 3 links")) });
    await userEvent.type(await screen.findByPlaceholderText("Write a comment…"), "x");
    await userEvent.click(screen.getByRole("button", { name: "Post" }));
    expect(await screen.findByText("Comments can have up to 3 links")).toBeInTheDocument();
  });
});
