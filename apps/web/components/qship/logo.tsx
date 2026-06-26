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

  const content = (
    <span className="inline-flex items-center gap-2.5">
      <Image
        src="/mascot-standing.png"
        alt="Qship"
        width={h}
        height={h}
        className="object-contain"
        priority
      />
      {showWordmark && (
        <span className="font-bold italic tracking-tight" style={{ fontSize: h * 0.55 }}>
          <span className="text-[#e31e24]">Q</span>
          <span className="text-white">ship</span>
        </span>
      )}
    </span>
  );

  if (!href) return content;

  return (
    <Link href={href} className="inline-flex shrink-0 items-center transition opacity-90 hover:opacity-100">
      {content}
    </Link>
  );
}
