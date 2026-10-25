import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Steamworks } from "./Steamworks";
import { defaultSaved, STORAGE_KEY } from "@/game/persistence";

vi.mock("@/hooks/useHandTracking", () => ({ useHandTracking: () => ({ status: "off", error: null }) }));
vi.mock("./Workbench", () => ({ Workbench: () => <div aria-label="Machine workbench" /> }));

beforeEach(() => {
  vi.useFakeTimers();
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...defaultSaved(), seenWelcome: true }));
});
afterEach(() => { cleanup(); vi.useRealTimers(); localStorage.clear(); });
const run = (ms: number) => act(() => { vi.advanceTimersByTime(ms); });
const click = (name: string | RegExp) => fireEvent.click(screen.getByRole("button", { name }));

describe("stable completion lifecycle", () => {
  it("requires two seconds of positive running input", () => {
    render(<Steamworks />);
    click("Show solution");
    run(1900);
    expect(screen.queryByRole("dialog")).toBeNull();
    run(200);
    expect(screen.getByRole("dialog", { name: "Level complete" })).toBeInTheDocument();
  });
  it("pause cancels the partial hold and requires a new full hold", () => {
    render(<Steamworks />);
    click("Show solution"); run(1800); click("Pause"); run(3000);
    expect(screen.queryByRole("dialog")).toBeNull();
    click("Start"); run(1800);
    expect(screen.queryByRole("dialog")).toBeNull();
    run(300);
    expect(screen.getByRole("dialog", { name: "Level complete" })).toBeInTheDocument();
  });
  it("reset cancels the old completion callback", () => {
    render(<Steamworks />);
    click("Show solution"); run(1800); click("Reset level"); click("Reset level"); run(3000);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}").completed).toEqual({});
  });
  it("level navigation cannot carry partial completion to another level", () => {
    render(<Steamworks />);
    click("Show solution"); run(1800); click(/Level 2:/); run(3000);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}").completed).toEqual({});
  });
  it("keep experimenting acknowledges success without repeated celebration", () => {
    render(<Steamworks />);
    click("Show solution"); run(2200); click("Keep experimenting"); run(4000);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}").completed).toEqual({ c1: "assisted" });
  });
});