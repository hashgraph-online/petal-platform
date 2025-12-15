import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AuthRequired } from "@/components/auth/auth-required";

vi.mock("@/components/wallet/connect-wallet-button", () => ({
  ConnectWalletButton: () => <button type="button">Mock Connect</button>,
}));

describe("AuthRequired", () => {
  it("shows overlay when disabled", () => {
    render(
      <AuthRequired enabled={false} title="Wallet required">
        <div>Form content</div>
      </AuthRequired>,
    );

    expect(screen.getByText("AUTHENTICATION_REQUIRED")).toBeInTheDocument();
    expect(screen.getByText("Wallet required")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Mock Connect" })).toBeInTheDocument();
  });

  it("renders children without overlay when enabled", () => {
    render(
      <AuthRequired enabled title="Wallet required">
        <div>Form content</div>
      </AuthRequired>,
    );

    expect(screen.getByText("Form content")).toBeInTheDocument();
    expect(screen.queryByText("AUTHENTICATION_REQUIRED")).toBeNull();
  });
});

