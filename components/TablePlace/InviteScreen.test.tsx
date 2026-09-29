import { render, screen } from "@testing-library/react";
import type { LobbyCreated } from "@/lib/tableplace/api";
import { InviteScreen } from "./InviteScreen";

jest.mock("react-hot-toast", () => ({
  toast: { success: jest.fn(), error: jest.fn() },
}));

const lobby: LobbyCreated = {
  lobby: "abc",
  lobby_url: "https://table.place/l/abc",
  seats: [
    { seat: 0, url: "https://table.place/l/abc?seat=0" },
    { seat: 1, url: "https://table.place/l/abc?seat=1" },
  ],
  expires_at: "2030-01-01T00:00:00Z",
};

describe("InviteScreen (issue #1063)", () => {
  it("opens seat 0 and hands seat 1 to the friend", () => {
    render(<InviteScreen lobby={lobby} onReset={jest.fn()} />);
    expect(screen.getByTestId("seat-0").getAttribute("href")).toBe(
      lobby.seats[0].url,
    );
    expect((screen.getByTestId("seat-1") as HTMLInputElement).value).toBe(
      lobby.seats[1].url,
    );
  });

  it("falls back to lobby_url when a seat has no link", () => {
    render(
      <InviteScreen lobby={{ ...lobby, seats: [] }} onReset={jest.fn()} />,
    );
    expect(screen.getByTestId("seat-0").getAttribute("href")).toBe(
      lobby.lobby_url,
    );
    expect((screen.getByTestId("seat-1") as HTMLInputElement).value).toBe(
      lobby.lobby_url,
    );
  });

  it("has real headings and the camera hint", () => {
    render(<InviteScreen lobby={lobby} onReset={jest.fn()} />);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(
      "Your table is ready",
    );
    expect(screen.getAllByRole("heading", { level: 2 })).toHaveLength(2);
    expect(screen.getByTestId("camera-hint").textContent).toContain(
      "Scroll out to see the whole table",
    );
  });

  it("calls onReset from 'Make another table'", () => {
    const onReset = jest.fn();
    render(<InviteScreen lobby={lobby} onReset={onReset} />);
    screen.getByText("Make another table").click();
    expect(onReset).toHaveBeenCalled();
  });
});
