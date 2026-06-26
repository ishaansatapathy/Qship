import Image from "next/image";

export function QshipLogoMark({ size = 28 }: { size?: number }) {
  return (
    <Image
      src="/mascot-standing.png"
      alt="ShipFlow"
      width={size}
      height={size}
      style={{ width: size, height: size, flexShrink: 0, objectFit: "contain" }}
      priority
    />
  );
}

export function QshipWordmark({ size = "md" }: { size?: "sm" | "md" | "lg" }) {
  const fontSize = size === "sm" ? 12 : size === "lg" ? 17 : 14;
  const gap = size === "lg" ? "0.38em" : size === "sm" ? "0.28em" : "0.34em";

  return (
    <span
      className="qship-wordmark"
      style={{
        fontSize,
        fontWeight: 600,
        color: "#fff",
        display: "inline-flex",
        alignItems: "baseline",
        gap,
        letterSpacing: "-0.02em",
      }}
      aria-label="ShipFlow"
    >
      <span style={{ color: "#e31e24", fontWeight: 700 }}>Ship</span>
      <span>Flow</span>
    </span>
  );
}
