/** Logo + nom : « Mawny » couleur texte, « track » en vert. */
export function Brand({ size = 30, style }: { size?: number; style?: React.CSSProperties }) {
  return (
    <div className="brand" style={style}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/mawnytrack-icon.svg" width={size} height={size} alt="" className="logo" />
      <span className="brand-name">
        Mawny<em>track</em>
      </span>
    </div>
  );
}
