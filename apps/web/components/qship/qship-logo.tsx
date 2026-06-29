import Image from "next/image";

const WORDMARK_HEIGHT = { sm: 22, md: 28, lg: 36 } as const;
const WORDMARK_WIDTH = { sm: 57, md: 73, lg: 94 } as const;

export function QshipLogoMark({ size = 28 }: { size?: number }) {
  return (
    <Image
      src="/qship-icon.png"
      alt="Qship"
      width={size}
      height={size}
      style={{ width: size, height: size, flexShrink: 0, objectFit: "contain" }}
      priority
    />
  );
}

export function QshipWordmark({ size = "md" }: { size?: "sm" | "md" | "lg" }) {
  const height = WORDMARK_HEIGHT[size];
  const width = WORDMARK_WIDTH[size];

  return (
    <Image
      src="/qship-logo.png"
      alt="Qship"
      width={width}
      height={height}
      style={{ width, height, flexShrink: 0, objectFit: "contain" }}
      priority
    />
  );
}
