export interface LegendColorProps {
  size?: number;
  color?: string;
}

export const LegendColor: React.FC<LegendColorProps> = ({
  size = 12,
  color,
}) => {
  return (
    <div
      style={{
        width: size,
        height: size,
        backgroundColor: color || "#000",
      }}
    />
  );
};
