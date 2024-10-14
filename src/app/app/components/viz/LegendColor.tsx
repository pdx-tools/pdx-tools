export interface LegendColorProps {
  size?: number;
  color?: string;
}

export const LegendColor = ({ size = 12, color }: LegendColorProps) => {
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
