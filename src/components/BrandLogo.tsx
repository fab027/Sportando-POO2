type BrandLogoProps = {
  className?: string;
  imgClassName?: string;
};

const BrandLogo = ({ className = "", imgClassName = "" }: BrandLogoProps) => (
  <div className={`flex items-center justify-center overflow-hidden rounded-2xl bg-primary shadow-sm ${className}`}>
    <img src="/logosportando.png" alt="Sportando" className={`h-full w-full scale-[1.75] object-cover ${imgClassName}`} />
  </div>
);

export default BrandLogo;
