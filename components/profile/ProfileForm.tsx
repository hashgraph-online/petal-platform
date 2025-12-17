"use client";

import { useCallback, useEffect, useState, type ChangeEvent, type FormEvent } from "react";
import { Spinner } from "@/components/ui/Spinner";
import { useToast } from "@/providers/toast-provider";
import { z } from "zod";
import { getLogger } from "@/lib/logger";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { ProfileImageSelector } from "@/components/profile/profile-image-selector";
import type { DAppSigner } from "@/lib/hedera/wallet-types";

const profileSchema = z.object({
  alias: z
    .string()
    .min(3, "Alias must be at least 3 characters")
    .max(32, "Alias must be at most 32 characters")
    .regex(/^[a-z0-9-_]+$/i, "Only letters, numbers, dashes, and underscores allowed"),
  displayName: z
    .string()
    .min(1, "Display name is required")
    .max(80, "Keep the display name under 80 characters"),
  avatarUrl: z
    .union([
      z.literal(""),
      z
        .string()
        .url("Avatar must be a valid URL")
        .max(200, "Avatar URL is too long"),
      z
        .string()
        .regex(
          /^hcs:\/\/1\/\d+\.\d+\.\d+$/u,
          "Avatar must be a valid HCS-1 reference (hcs://1/0.0.x)",
        )
        .max(200, "Avatar URL is too long"),
    ])
    .optional(),
  bio: z
    .string()
    .max(280, "Bio should be 280 characters or less")
    .optional()
    .or(z.literal("")),
});

export type ProfileFormValues = z.infer<typeof profileSchema>;

type SubmitState = "idle" | "saving" | "saved" | "error";

type ProfileFormProps = {
  initialValues?: Partial<ProfileFormValues>;
  onSubmit: (values: ProfileFormValues) => Promise<void>;
  disabled?: boolean;
  disabledMessage?: string;
  network?: "mainnet" | "testnet";
  signer?: DAppSigner | null;
};

export function ProfileForm({
  initialValues,
  onSubmit,
  disabled = false,
  disabledMessage,
  network = "testnet",
  signer = null,
}: ProfileFormProps) {
  const logger = getLogger("profile-form");
  const [values, setValues] = useState<ProfileFormValues>({
    alias: initialValues?.alias ?? "",
    displayName: initialValues?.displayName ?? "",
    avatarUrl: initialValues?.avatarUrl ?? "",
    bio: initialValues?.bio ?? "",
  });

  useEffect(() => {
    setValues({
      alias: initialValues?.alias ?? "",
      displayName: initialValues?.displayName ?? "",
      avatarUrl: initialValues?.avatarUrl ?? "",
      bio: initialValues?.bio ?? "",
    });
  }, [initialValues?.alias, initialValues?.displayName, initialValues?.avatarUrl, initialValues?.bio]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<SubmitState>("idle");
  const [statusMessage, setStatusMessage] = useState<string>("");
  const { pushToast } = useToast();

  const handleChange = (key: keyof ProfileFormValues) =>
    (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      setValues((current) => ({ ...current, [key]: event.target.value }));
      setStatus("idle");
      setStatusMessage("");
    };

  const handleAvatarChange = useCallback(
    (next: string) => {
      setValues((current) => ({ ...current, avatarUrl: next }));
      setStatus("idle");
      setStatusMessage("");
    },
    [],
  );

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("idle");
    setStatusMessage("");
    if (disabled) {
      const message =
        disabledMessage ?? "Connect your wallet before publishing a profile.";
      setStatus("error");
      setStatusMessage(message);
      pushToast({
        title: "Wallet required",
        description: message,
        variant: "error",
      });
      return;
    }

    const parsed = profileSchema.safeParse(values);
    if (!parsed.success) {
      const fieldErrors: Record<string, string> = {};
      parsed.error.issues.forEach((issue) => {
        const [field] = issue.path;
        if (typeof field === "string") {
          fieldErrors[field] = issue.message;
        }
      });
      setErrors(fieldErrors);
      return;
    }

    setErrors({});
    setStatus("saving");

    try {
      await onSubmit({
        alias: parsed.data.alias,
        displayName: parsed.data.displayName,
        avatarUrl: parsed.data.avatarUrl ?? "",
        bio: parsed.data.bio ?? "",
      });
      setStatus("saved");
      setStatusMessage("Profile saved on Hedera");
      pushToast({ title: "Profile published", variant: "success" });
    } catch (error) {
      logger.error("Failed to submit profile", error);
      setStatus("error");
      setStatusMessage(
        error instanceof Error ? error.message : "Failed to save profile",
      );
      pushToast({ title: "Profile update failed", description: String(error), variant: "error" });
    }
  }

  return (
    <form className="space-y-6" onSubmit={handleSubmit}>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-2">
          <span className="text-sm font-medium text-holNavy">Alias</span>
          <Input
            type="text"
            name="alias"
            value={values.alias}
            onChange={handleChange("alias")}
            disabled={disabled}
            placeholder="agent-alias"
            autoComplete="off"
          />
          {errors.alias ? (
            <span className="text-xs text-red-600">{errors.alias}</span>
          ) : (
            <span className="text-xs text-holNavy/60">
              Stable identifier used for registry discovery. Lowercase, numbers,
              dashes, and underscores only.
            </span>
          )}
        </label>
        <label className="flex flex-col gap-2">
          <span className="text-sm font-medium text-holNavy">Display name</span>
          <Input
            type="text"
            name="displayName"
            value={values.displayName}
            onChange={handleChange("displayName")}
            disabled={disabled}
            placeholder="Alice (Petal)"
            autoComplete="name"
          />
          {errors.displayName ? (
            <span className="text-xs text-red-600">{errors.displayName}</span>
          ) : (
            <span className="text-xs text-holNavy/60">
              Friendly name exposed to other users and floras.
            </span>
          )}
        </label>
      </div>
      <label className="flex flex-col gap-2">
        <ProfileImageSelector
          value={values.avatarUrl ?? ""}
          onChange={handleAvatarChange}
          network={network}
          signer={signer}
          disabled={disabled}
        />
        {errors.avatarUrl ? (
          <span className="text-xs text-red-600">{errors.avatarUrl}</span>
        ) : null}
      </label>
      <label className="flex flex-col gap-2">
        <span className="text-sm font-medium text-holNavy">Bio</span>
        <Textarea
          name="bio"
          value={values.bio}
          onChange={handleChange("bio")}
          disabled={disabled}
          className="min-h-[120px]"
          placeholder="Summarise this identity for other agents."
        />
        {errors.bio ? (
          <span className="text-xs text-red-600">{errors.bio}</span>
        ) : (
          <span className="text-xs text-holNavy/60">
            Keep bios short and focused. 280 characters max.
          </span>
        )}
      </label>
      <div className="flex items-center gap-3">
        <Button
          type="submit"
          disabled={disabled || status === "saving"}
          className="inline-flex items-center justify-center rounded-full bg-gradient-to-r from-holBlue to-holPurple px-5 py-2 text-sm font-semibold text-white shadow-lg shadow-holBlue/25 ring-1 ring-holBlue/40 transition hover:shadow-holPurple/35 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {status === "saving" ? (
            <span className="flex items-center gap-2">
              <Spinner size="sm" /> Saving…
            </span>
          ) : (
            "Save profile"
          )}
        </Button>
        {statusMessage ? (
          <span
            className={`text-sm ${
              status === "error" ? "text-red-600" : "text-holNavy/70"
            }`}
          >
            {statusMessage}
          </span>
        ) : null}
      </div>
    </form>
  );
}
