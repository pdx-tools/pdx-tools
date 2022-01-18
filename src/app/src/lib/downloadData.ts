export function downloadData(data: BlobPart, fileName: string) {
  const link = document.createElement("a");
  link.style.display = "none";
  document.body.append(link);
  const blob = new Blob([data], {
    type: "application/octet-stream",
  });

  link.href = URL.createObjectURL(blob);
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(link.href);
  link.remove();
}
