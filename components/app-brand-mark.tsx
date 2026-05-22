import Image from "next/image";

type AppBrandMarkProps = {
  size?: number;
  className?: string;
  alt?: string;
  priority?: boolean;
};

export function AppBrandMark({
  size = 48,
  className = "",
  alt = "TCM",
  priority = false,
}: AppBrandMarkProps) {
  return (
    <Image
      src="/brand/app-icon.png"
      alt={alt}
      width={size}
      height={size}
      priority={priority}
      className={`object-contain ${className}`.trim()}
    />
  );
}
