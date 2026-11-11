import Image from "next/image";

type BrandIconProps = {
  className: string;
};

export default function BrandIcon({ className }: BrandIconProps) {
  return (
    <Image
      src="/cartonlab-icon.png"
      alt=""
      aria-hidden="true"
      className={className}
      width={128}
      height={128}
    />
  );
}
