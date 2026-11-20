import Image from "next/image";

type BrandLogoProps = {
  className: string;
};

export default function BrandLogo({ className }: BrandLogoProps) {
  return (
    <Image
      src="/packstudio-wordmark.png"
      alt="PackStudio"
      className={className}
      width={264}
      height={41}
      unoptimized
    />
  );
}
