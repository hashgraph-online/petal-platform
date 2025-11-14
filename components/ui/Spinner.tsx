"use client";

export function Spinner({ size = "sm" }: { size?: "sm" | "md" | "lg" }) {
  const dimension = size === "lg" ? "h-8 w-8" : size === "md" ? "h-6 w-6" : "h-4 w-4";
  return (
    <span
      className={`${dimension} animate-spin rounded-full border-2 border-holBlue/80 border-t-transparent`}
      role="status"
      aria-label="Loading"
    />
  );
}
