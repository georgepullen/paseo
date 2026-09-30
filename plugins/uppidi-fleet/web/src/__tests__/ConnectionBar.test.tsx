import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ConnectionBar } from "../components/ConnectionBar.js";

afterEach(() => {
  cleanup();
});

describe("ConnectionBar", () => {
  it("submits host and token on connect", async () => {
    const user = userEvent.setup();
    const onConnect = vi.fn();
    render(
      <ConnectionBar
        status="disconnected"
        host="10.20.30.24:6767"
        token=""
        wsUrl="ws://10.20.30.24:6767/ws"
        onConnect={onConnect}
        onDisconnect={() => {}}
      />,
    );

    await user.type(screen.getByLabelText("Token"), "s3cret");
    await user.click(screen.getByRole("button", { name: "Connect" }));
    expect(onConnect).toHaveBeenCalledWith("10.20.30.24:6767", "s3cret");
  });

  it("prefills the token field", () => {
    render(
      <ConnectionBar
        status="disconnected"
        host="10.20.30.24:6767"
        token="stored-secret"
        wsUrl="ws://10.20.30.24:6767/ws"
        onConnect={() => {}}
        onDisconnect={() => {}}
      />,
    );
    expect(screen.getByLabelText("Token")).toHaveValue("stored-secret");
  });
});
