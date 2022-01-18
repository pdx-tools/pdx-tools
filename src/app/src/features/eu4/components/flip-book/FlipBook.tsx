import React, { useState } from "react";
import { Button, Space } from "antd";
import { LeftOutlined, RightOutlined } from "@ant-design/icons";

interface FlipBookProps<T> {
  items: T[];
  itemRender: (arg0: T) => JSX.Element;
}

export function FlipBook<T>({
  items,
  itemRender,
}: FlipBookProps<T>): JSX.Element {
  const [ind, setInd] = useState(0);
  if (items.length === 0) {
    return <span>None detected</span>;
  } else if (items.length === 1) {
    return itemRender(items[0]);
  } else {
    return (
      <Space>
        <Button
          icon={<LeftOutlined />}
          type="text"
          disabled={ind == 0}
          onClick={() => setInd(ind - 1)}
        ></Button>
        {itemRender(items[ind])}
        <Button
          type="text"
          icon={<RightOutlined />}
          disabled={ind == items.length - 1}
          onClick={() => setInd(ind + 1)}
        ></Button>
      </Space>
    );
  }
}
