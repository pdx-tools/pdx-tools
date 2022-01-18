const ELEVATIONS = {
  small: `
    drop-shadow(0.5px 1px 1px hsl(var(--shadow-color) / 0.7))
  `,
  medium: `
    drop-shadow(1px 2px 2px hsl(var(--shadow-color) / 0.333))
    drop-shadow(2px 4px 4px hsl(var(--shadow-color) / 0.333))
    drop-shadow(3px 6px 6px hsl(var(--shadow-color) / 0.333))
  `,
  large: `
    drop-shadow(1px 2px 2px hsl(var(--shadow-color) / 0.2))
    drop-shadow(2px 4px 4px hsl(var(--shadow-color) / 0.2))
    drop-shadow(4px 8px 8px hsl(var(--shadow-color) / 0.2))
    drop-shadow(8px 16px 16px hsl(var(--shadow-color) / 0.2))
    drop-shadow(16px 32px 32px hsl(var(--shadow-color) / 0.2))
  `,
};

interface ShadowProps {
  size?: keyof typeof ELEVATIONS;
  backgroundColor?: [number, number, number];
}

// https://www.joshwcomeau.com/css/designing-shadows/#fitting-into-a-design-system
export const Shadow: React.FC<ShadowProps> = ({
  children,
  size,
  backgroundColor,
}) => {
  const color = backgroundColor ?? [0, 0, 100];
  let sz = size ?? "medium";
  return (
    <div>
      {children}
      <style jsx>{`
        div {
          --shadow-color: ${color[0]}deg ${color[1]}% ${color[2] / 2}%;
          filter: ${ELEVATIONS[sz]};
        }
      `}</style>
    </div>
  );
};
