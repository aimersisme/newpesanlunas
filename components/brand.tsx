import Image from "next/image";

export function Brand({
  compact = false,
  showTagline = false,
}: {
  compact?: boolean;
  showTagline?: boolean;
}) {
  return (
    <div className={`brand ${showTagline ? "brandWithTagline" : ""}`}>
      <Image
        className="brandLogo"
        src="/pesanlunas-logo.png"
        width={44}
        height={44}
        alt="Logo PesanLunas"
        priority
      />
      {!compact ? (
        <span className="brandCopy">
          <span className="brandName">PesanLunas</span>
          {showTagline ? <span className="brandTagline">Pesanan tercatat, tagihan cepat lunas.</span> : null}
        </span>
      ) : null}
    </div>
  );
}
