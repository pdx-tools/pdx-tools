import React, {
  ComponentPropsWithoutRef,
  ElementRef,
  forwardRef,
  useState,
} from "react";
import { Input } from "@/components/Input";
import { keyboardTrigger } from "@/lib/keyboardTrigger";

type InputEvent = React.SyntheticEvent<ElementRef<typeof Input>>;
type InputNumberEvent = InputEvent & { value: number };
export const InputNumber = forwardRef<
  ElementRef<typeof Input>,
  Omit<ComponentPropsWithoutRef<typeof Input>, "onChange"> & {
    onChange: (e: InputNumberEvent) => void;
  }
>(function InputNumber({ value, onChange, ...props }, ref) {
  const [backing, setBacking] = useState(value);

  // When value changes, update the backing store
  const [prevValue, setPrevValue] = useState(value);
  if (prevValue !== value) {
    setBacking(value);
    setPrevValue(value);
  }

  const changeCb = (e: InputEvent) => {
    const result = Number(e.currentTarget.value);
    if (isNaN(result)) {
      return;
    }

    onChange({
      value: result,
      ...e,
    });
  };

  return (
    <Input
      ref={ref}
      {...props}
      inputMode="numeric"
      type="text"
      value={backing}
      onKeyDown={keyboardTrigger(changeCb, "Enter")}
      onBlur={changeCb}
      onChange={(e) => setBacking(e.currentTarget.value)}
    />
  );
});
