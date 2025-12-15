import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PetalCreateForm } from "@/components/petals/PetalCreateForm";
import { ToastProvider } from "@/providers/toast-provider";

describe("PetalCreateForm wallet gating", () => {
  it("disables inputs and blocks submit when no base account", async () => {
    const onCreate = vi.fn(async () => {});

    render(
      <ToastProvider>
        <PetalCreateForm onCreate={onCreate} baseAccountId={null} basePublicKey={null} />
      </ToastProvider>,
    );

    expect(screen.getByPlaceholderText("project-alice")).toBeDisabled();
    const numberInputs = screen.getAllByRole("spinbutton");
    expect(numberInputs).toHaveLength(2);
    numberInputs.forEach((input) => expect(input).toBeDisabled());

    const submit = screen.getByRole("button", { name: "Create petal" });
    expect(submit).toBeDisabled();

    const form = submit.closest("form");
    if (!form) {
      throw new Error("Expected form element");
    }

    fireEvent.submit(form);
    expect(onCreate).not.toHaveBeenCalled();
  });
});

