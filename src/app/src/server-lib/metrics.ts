import client from "prom-client";

// We clear out any registered metrics to workaround the
// "A metric with the name already has been registered" in
// development
client.register.clear();

client.collectDefaultMetrics({
  prefix: "pdx_tools_",
});

export { client as metrics };
