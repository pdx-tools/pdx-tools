import { MapPlayground } from "./MapPlayground";

const root = document.getElementById("root");
if (!root) {
  throw new Error("Root element not found");
}

new MapPlayground(root);
