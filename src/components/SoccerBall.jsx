// Stylized soccer ball used as the landing-page accent. Same geometry as
// public/favicon.svg (central point-up pentagon + 5 seams radiating to the
// edge) so the brand mark stays consistent across favicon, header and hero.
// No background — meant to sit over any color. Pass props through to <svg>
// for sizing / styling.

export default function SoccerBall({ className = '', ...props }) {
  return (
    <svg
      viewBox="0 0 200 200"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
      {...props}
    >
      <defs>
        {/* Subtle 3D highlight so the ball doesn't look flat at large sizes */}
        <radialGradient id="ballHighlight" cx="35%" cy="30%" r="75%">
          <stop offset="0%"  stopColor="#ffffff" />
          <stop offset="60%" stopColor="#f5f5f4" />
          <stop offset="100%" stopColor="#d6d3d1" />
        </radialGradient>
        <radialGradient id="ballShadow" cx="65%" cy="80%" r="65%">
          <stop offset="0%"  stopColor="#000000" stopOpacity="0.22" />
          <stop offset="100%" stopColor="#000000" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* Ball body */}
      <circle cx="100" cy="100" r="95" fill="url(#ballHighlight)" />
      <circle cx="100" cy="100" r="95" fill="url(#ballShadow)" />

      {/* Central pentagon, point up */}
      <polygon
        points="100,72 126.6,91.36 116.46,122.64 83.54,122.64 73.4,91.36"
        fill="#0f1e3d"
      />

      {/* 5 seams radiating from pentagon vertices to the ball edge */}
      <g stroke="#0f1e3d" strokeWidth="6.5" strokeLinecap="round" fill="none">
        <line x1="100"    y1="72"     x2="100"    y2="14"  />
        <line x1="126.6"  y1="91.36"  x2="172.5"  y2="76"  />
        <line x1="116.46" y1="122.64" x2="144.5"  y2="170" />
        <line x1="83.54"  y1="122.64" x2="55.5"   y2="170" />
        <line x1="73.4"   y1="91.36"  x2="27.5"   y2="76"  />
      </g>

      {/* Stylized rim pentagons (small, partial) — hint at the full
          icosahedron pattern without trying to be geometrically perfect */}
      <g fill="#0f1e3d">
        <polygon points="100,14 109,11 112,22 88,22 91,11" />
        <polygon points="172.5,76 180,80 175,90 163,86 166,76" />
        <polygon points="144.5,170 140,177 130,170 137,162 147,164" />
        <polygon points="55.5,170 60,177 70,170 63,162 53,164" />
        <polygon points="27.5,76 20,80 25,90 37,86 34,76" />
      </g>
    </svg>
  )
}
