export default {
  fetch() {
    return new Response("This preview is closed. Go to https://pdx.tools.\n", {
      status: 410,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  },
};
