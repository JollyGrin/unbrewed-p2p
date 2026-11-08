import { render, screen } from "@testing-library/react";
import { toastReplaySaveResult } from "./replaySaveToast";

const toastSuccess = jest.fn();
const toastError = jest.fn();
jest.mock("react-hot-toast", () => ({
  toast: {
    success: (...args: unknown[]) => toastSuccess(...args),
    error: (...args: unknown[]) => toastError(...args),
    dismiss: jest.fn(),
  },
}));

beforeEach(() => {
  toastSuccess.mockReset();
  toastError.mockReset();
});

type Renderable = (t: { id: string }) => JSX.Element;

describe("toastReplaySaveResult (#1551)", () => {
  it("toasts an error linking to Replays when the save fails, and no success", () => {
    toastReplaySaveResult({ ok: false, id: "r1", evicted: [], error: "not enough space (only starred replays remain)" });
    expect(toastSuccess).not.toHaveBeenCalled();
    expect(toastError).toHaveBeenCalledTimes(1);
    const [content, opts] = toastError.mock.calls[0] as [Renderable, { id: string }];
    expect(opts.id).toBe("replay-save-failed");
    render(content({ id: "t1" }));
    expect(screen.getByText(/Couldn.t save this replay — free up space in/)).toBeTruthy();
    expect(screen.getByRole("link", { name: "Replays" }).getAttribute("href")).toBe("/pro/replays");
  });

  it("toasts success and no error when the save works", () => {
    toastReplaySaveResult({ ok: true, id: "r1", evicted: [] });
    expect(toastError).not.toHaveBeenCalled();
    expect(toastSuccess).toHaveBeenCalledTimes(1);
    const [content] = toastSuccess.mock.calls[0] as [Renderable];
    render(content({ id: "t1" }));
    expect(screen.getByRole("link", { name: "Replays" }).getAttribute("href")).toBe("/pro/replays");
  });
});
