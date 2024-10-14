export function keyboardTrigger<T extends React.KeyboardEvent<R>, R = Element>(
  fn: (event: React.KeyboardEvent<R>) => any,
  key: "Space" | "Enter" | undefined = "Enter",
) {
  const k = key == "Space" ? " " : key;
  return (e: T) => {
    if (e.key === k && !e.isPropagationStopped()) {
      e.preventDefault();
      e.stopPropagation();
      fn(e);
    }
  };
}
