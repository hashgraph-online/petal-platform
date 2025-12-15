import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ProfileForm } from "@/components/profile/ProfileForm";
import { ToastProvider } from "@/providers/toast-provider";

describe("ProfileForm wallet gating", () => {
  it("disables fields and blocks submit when disabled", async () => {
    const onSubmit = vi.fn(async () => {});

    render(
      <ToastProvider>
        <ProfileForm onSubmit={onSubmit} disabled />
      </ToastProvider>,
    );

    expect(screen.getByPlaceholderText("agent-alias")).toBeDisabled();
    expect(screen.getByPlaceholderText("Alice (Petal)")).toBeDisabled();
    expect(
      screen.getByPlaceholderText("https://cdn.hol.org/avatars/alice.png"),
    ).toBeDisabled();
    expect(
      screen.getByPlaceholderText("Summarise this identity for other agents."),
    ).toBeDisabled();

    const submit = screen.getByRole("button", { name: "Save profile" });
    expect(submit).toBeDisabled();

    const form = submit.closest("form");
    if (!form) {
      throw new Error("Expected form element");
    }

    fireEvent.submit(form);
    expect(onSubmit).not.toHaveBeenCalled();
  });
});

