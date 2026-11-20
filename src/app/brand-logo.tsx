import Image from "next/image";

type BrandLogoProps = {
  className: string;
};

export default function BrandLogo({ className }: BrandLogoProps) {
  return (
    <Image
      src="/cartonlab-wordmark-white.png"
      alt=""
      aria-hidden="true"
      className={className}
      width={264}
      height={41}
    />
  );
}
