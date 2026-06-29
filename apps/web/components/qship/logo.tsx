import Image from "next/image";
import Link from "next/link";

type QshipLogoProps = {
  href?: string;
  size?: "sm" | "md" | "lg";
  showWordmark?: boolean;
};

const heights = { sm: 32, md: 40, lg: 52 } as const;

export function QshipLogo({ href = "/", size = "md", showWordmark = true }: QshipLogoProps) {
  const h = heights[size];
  const wordmarkWidth = Math.round(h * (406 / 156));

  const content = showWordmark ? (
    <Image
      src="/qship-logo.png"
      alt="Qship"
      width={wordmarkWidth}
      height={h}
      className="object-contain"
      style={{ width: wordmarkWidth, height: h }}
      priority
    />
  ) : (
    <Image
      src="/qship-icon.png"
      alt="Qship"
      width={h}
      height={h}
      className="object-contain"
      style={{ width: h, height: h }}
      priority
    />
  );

  if (!href) return content;

  return (
    <Link href={href} className="inline-flex shrink-0 items-center transition opacity-90 hover:opacity-100">
      {content}
    </Link>
  );
}
