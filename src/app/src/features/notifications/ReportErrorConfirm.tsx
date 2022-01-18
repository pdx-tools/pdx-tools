import React from "react";
import { Modal } from "antd";
import { ExclamationCircleOutlined } from "@ant-design/icons";

export const askToSendErrorReport = (err: any, fn: () => Promise<any>) => {
  Modal.confirm({
    title: "Hmm, something about that save was unexpected. Send report?",
    icon: <ExclamationCircleOutlined />,
    content: `The save failed to parse. In order to fix the issue, would you like to upload the save directly? You can also cancel and upload to the discord. The save won't be public and will only be used internally. The error ${err}`,
    onOk: fn,
    onCancel() {},
  });
};
