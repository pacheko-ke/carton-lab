import Image from "next/image";

type BrandIconProps = {
  className: string;
};

export default function BrandIcon({ className }: BrandIconProps) {
  return (
    <Image
      src="/packstudio-symbol.png"
      alt=""
      aria-hidden="true"
      className={className}
      width={37}
      height={37}
    />
  );
}
