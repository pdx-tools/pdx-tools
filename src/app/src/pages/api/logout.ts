import { withHttpSession } from "@/server-lib/session";
import { ProfileResponse } from "@/services/rakalyApi";

export default withHttpSession((req, res) => {
  req.session.destroy();
  const result: ProfileResponse = {
    kind: "guest",
  };
  res.json(result);
});
