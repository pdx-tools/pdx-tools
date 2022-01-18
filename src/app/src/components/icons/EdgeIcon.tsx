import Icon from "@ant-design/icons";

export const EdgeSvg: React.FC<{}> = () => {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      height="32"
      width="32"
      viewBox="0 0 260 260"
    >
      <style jsx>{`
        svg {
          filter: contrast(0.5) brightness(1.5) saturate(0);
        }
      `}</style>
      <defs>
        <radialGradient
          gradientUnits="userSpaceOnUse"
          gradientTransform="matrix(1 0 0 -.95 -4.61 243.92)"
          r="95.38"
          cy="68.91"
          cx="161.83"
          id="b"
        >
          <stop stopOpacity="0" offset=".72" />
          <stop stopOpacity=".53" offset=".95" />
          <stop offset="1" />
        </radialGradient>
        <radialGradient
          gradientUnits="userSpaceOnUse"
          gradientTransform="matrix(.15 -.99 -.8 -.12 172.03 -130.32)"
          r="143.24"
          cy="62.99"
          cx="-340.29"
          id="d"
        >
          <stop stopOpacity="0" offset=".76" />
          <stop stopOpacity=".5" offset=".95" />
          <stop offset="1" />
        </radialGradient>
        <radialGradient
          gradientUnits="userSpaceOnUse"
          gradientTransform="matrix(-.04 1 2.13 .08 -1184.15 -111.61)"
          r="202.43"
          cy="570.21"
          cx="113.37"
          id="e"
        >
          <stop stopColor="#35c1f1" offset="0" />
          <stop stopColor="#34c1ed" offset=".11" />
          <stop stopColor="#2fc2df" offset=".23" />
          <stop stopColor="#2bc3d2" offset=".31" />
          <stop stopColor="#36c752" offset=".67" />
        </radialGradient>
        <radialGradient
          gradientUnits="userSpaceOnUse"
          gradientTransform="matrix(.28 .96 .78 -.23 -308.37 -153.42)"
          r="97.34"
          cy="567.97"
          cx="376.52"
          id="f"
        >
          <stop stopColor="#66eb6e" offset="0" />
          <stop stopOpacity="0" stopColor="#66eb6e" offset="1" />
        </radialGradient>
        <linearGradient
          gradientUnits="userSpaceOnUse"
          gradientTransform="matrix(1 0 0 -1 -4.61 261.08)"
          y2="84.03"
          x2="241.67"
          y1="84.03"
          x1="63.33"
          id="a"
        >
          <stop stopColor="#0c59a4" offset="0" />
          <stop stopColor="#114a8b" offset="1" />
        </linearGradient>
        <linearGradient
          gradientUnits="userSpaceOnUse"
          gradientTransform="matrix(1 0 0 -1 -4.61 261.08)"
          y2="40.06"
          x2="45.96"
          y1="161.39"
          x1="157.35"
          id="c"
        >
          <stop stopColor="#1b9de2" offset="0" />
          <stop stopColor="#1595df" offset=".16" />
          <stop stopColor="#0680d7" offset=".67" />
          <stop stopColor="#0078d4" offset="1" />
        </linearGradient>
      </defs>
      <path
        d="M231.07 190.54a93.73 93.73 0 01-10.54 4.71 101.87 101.87 0 01-35.9 6.46c-47.32 0-88.54-32.55-88.54-74.32a31.48 31.48 0 0116.43-27.31c-42.8 1.8-53.8 46.4-53.8 72.53 0 73.88 68.09 81.37 82.76 81.37 7.91 0 19.84-2.3 27-4.56l1.31-.44a128.34 128.34 0 0066.6-52.8 4 4 0 00-5.32-5.64z"
        fill="url(#a)"
      />
      <path
        style={{ isolation: "isolate" }}
        d="M231.07 190.54a93.73 93.73 0 01-10.54 4.71 101.87 101.87 0 01-35.9 6.46c-47.32 0-88.54-32.55-88.54-74.32a31.48 31.48 0 0116.43-27.31c-42.8 1.8-53.8 46.4-53.8 72.53 0 73.88 68.09 81.37 82.76 81.37 7.91 0 19.84-2.3 27-4.56l1.31-.44a128.34 128.34 0 0066.6-52.8 4 4 0 00-5.32-5.64z"
        fill="url(#b)"
        opacity=".35"
      />
      <path
        d="M105.73 241.42a79.2 79.2 0 01-22.74-21.34 80.72 80.72 0 0129.53-120c3.12-1.47 8.45-4.13 15.54-4a32.35 32.35 0 0125.69 13 31.88 31.88 0 016.36 18.66c0-.21 24.46-79.6-80-79.6-43.9 0-80 41.66-80 78.21a130.15 130.15 0 0012.11 56 128 128 0 00156.38 67.11 75.55 75.55 0 01-62.78-8z"
        fill="url(#c)"
      />
      <path
        style={{ isolation: "isolate" }}
        d="M105.73 241.42a79.2 79.2 0 01-22.74-21.34 80.72 80.72 0 0129.53-120c3.12-1.47 8.45-4.13 15.54-4a32.35 32.35 0 0125.69 13 31.88 31.88 0 016.36 18.66c0-.21 24.46-79.6-80-79.6-43.9 0-80 41.66-80 78.21a130.15 130.15 0 0012.11 56 128 128 0 00156.38 67.11 75.55 75.55 0 01-62.78-8z"
        fill="url(#d)"
        opacity=".41"
      />
      <path
        d="M152.33 148.86c-.81 1.05-3.3 2.5-3.3 5.66 0 2.61 1.7 5.12 4.72 7.23 14.38 10 41.49 8.68 41.56 8.68a59.56 59.56 0 0030.27-8.35 61.38 61.38 0 0030.43-52.88c.26-22.41-8-37.31-11.34-43.91C223.48 23.84 177.74 0 128 0A128 128 0 000 126.2c.48-36.54 36.8-66.05 80-66.05 3.5 0 23.46.34 42 10.07 16.34 8.58 24.9 18.94 30.85 29.21 6.18 10.67 7.28 24.15 7.28 29.52 0 5.37-2.74 13.33-7.8 19.91z"
        fill="url(#e)"
      />
      <path
        d="M152.33 148.86c-.81 1.05-3.3 2.5-3.3 5.66 0 2.61 1.7 5.12 4.72 7.23 14.38 10 41.49 8.68 41.56 8.68a59.56 59.56 0 0030.27-8.35 61.38 61.38 0 0030.43-52.88c.26-22.41-8-37.31-11.34-43.91C223.48 23.84 177.74 0 128 0A128 128 0 000 126.2c.48-36.54 36.8-66.05 80-66.05 3.5 0 23.46.34 42 10.07 16.34 8.58 24.9 18.94 30.85 29.21 6.18 10.67 7.28 24.15 7.28 29.52 0 5.37-2.74 13.33-7.8 19.91z"
        fill="url(#f)"
      />
    </svg>
  );
};

type EdgeProps = React.ComponentProps<typeof Icon>;
export const EdgeIcon: React.FC<EdgeProps> = (props) => (
  <Icon component={EdgeSvg} {...props} />
);
