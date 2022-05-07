import { Button } from "antd";
import { useState } from "react";
import { CountryFilterDrawer } from "./CountryFilterDrawer";
import { FilterOutlined } from "@ant-design/icons";

type ButtonProps = React.ComponentProps<typeof Button>;
export type CountryFilterButtonProps = ButtonProps;

export const CountryFilterButton = (props: CountryFilterButtonProps) => {
  const [visible, setVisible] = useState(false);

  const btn: ButtonProps = {
    ...props,
    icon: <FilterOutlined />,
    onClick: () => setVisible(true),
  };

  return (
    <>
      <Button {...btn}></Button>
      <CountryFilterDrawer
        visible={visible}
        closeDrawer={() => setVisible(false)}
      />
    </>
  );
};
