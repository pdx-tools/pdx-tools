import { Alert } from "@/components/Alert";
export function SkanderbegAlert() {
  return (
    <Alert variant="info" className="p-4">
      <Alert.Title>Skanderbeg support has been sunset</Alert.Title>
      <Alert.Description>
        Skanderbeg no longer supports direct access to saves from PDX.Tools.
      </Alert.Description>
    </Alert>
  );
}
