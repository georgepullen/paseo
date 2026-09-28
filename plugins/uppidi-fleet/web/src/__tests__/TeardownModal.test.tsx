import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TeardownModal } from "../components/TeardownModal.js";

describe("TeardownModal", () => {
  it("renders nothing when closed", () => {
    const { container } = render(
      <TeardownModal open={false} busy={false} result={null} onClose={() => {}} onConfirm={() => {}} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("requires the arm checkbox before enabling teardown", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(<TeardownModal open={true} busy={false} result={null} onClose={() => {}} onConfirm={onConfirm} />);

    const confirm = screen.getByRole("button", { name: "Teardown" });
    expect(confirm).toBeDisabled();

    await user.click(screen.getByText("I understand this archives the selected agents"));
    expect(confirm).toBeEnabled();

    await user.click(confirm);
    expect(onConfirm).toHaveBeenCalledWith(["workers"]);
  });

  it("surfaces daemon results", () => {
    render(
      <TeardownModal
        open={true}
        busy={false}
        result="Archived workers=2 orchestrators=0 frontdesk=0."
        onClose={() => {}}
        onConfirm={() => {}}
      />,
    );
    expect(screen.getByRole("status")).toHaveTextContent("Archived workers=2");
  });
});
