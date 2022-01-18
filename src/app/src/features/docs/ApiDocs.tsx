import React from "react";
import Link from "next/link";
import { PageHeader } from "antd";
import { useSelector } from "react-redux";
import { selectUserInfo } from "../account/sessionSlice";

export const ApiDocs: React.FC<{}> = ({}) => {
  const userInfo = useSelector(selectUserInfo);
  const uid = userInfo?.user_id ?? "yourrakalyUserId";
  const cli = <a href="https://github.com/rakaly/cli">Rakaly CLI</a>;
  return (
    <PageHeader
      title="Rakaly API Docs"
      style={{ width: "min(650px, 100%)", margin: "0 auto" }}
    >
      <style jsx>{`
        pre {
          overflow: auto;
        }

        dl {
          margin-left: 3em;
        }
      `}</style>
      <p>
        Before getting started with Rakaly's API, you'll want to ensure you have
        a Rakaly account so you can get an API key. You can always generate a
        new API key on the{" "}
        <Link href="/account">
          <a>account page.</a>
        </Link>
      </p>
      <p>
        Rakaly's philosophy is to have an overly simple API and push most of the
        analysis client side so all uploaded saves can seamlessly take advantage
        of new features as they are added to the analysis engine. If it is
        desired to upload a save and then perform queries against the save, then
        consider Skanderbeg's API.
      </p>
      <p>
        Please use the <a href="https://discord.gg/rCpNWQW">Discord</a> for help
        with the API or if you have any suggestions.
      </p>
      <span>TOC:</span>
      <ul>
        <li>
          <a href="#local-analysis">Local Analysis</a>
        </li>
        <li>
          <a href="#upload">Upload</a>
        </li>
        <li>
          <a href="#melt">Melt</a>
        </li>
      </ul>
      <h2 id="local-analysis">Local Analysis</h2>
      <p>
        It is not required to upload a save in order for it to be analyzed.
        Rakaly is able to analyze saves that are transferred to it within the
        browser. This means that you could have a web page, which when visited,
        loads the save, opens the{" "}
        <Link href="/">
          <a>EU4 analyze page</a>
        </Link>
        , and then posts data to Rakaly with the help of:
      </p>
      <a href="https://developer.mozilla.org/en-US/docs/Web/API/Window/postMessage">
        <pre>Window.postMessage().</pre>
      </a>
      <p>
        When the Rakaly has finished initializing it will send a message to your
        tab with the contents of "rakaly-loaded", informing that Rakaly is now
        ready to receive the file.
      </p>
      <p>
        You can refer to how{" "}
        <a href="https://github.com/crschnick/pdx_unlimiter/blob/68b758f66885836d8d51b51936bdd07a89585877/resources/web/rakaly.html">
          Pdx-Unlimiter
        </a>{" "}
        accomplishes it for an idea for your own implementation, but in short
        the code looks something like:
      </p>
      <pre>{`<html>
<body>
  <input type="file" />

  <script>
    function fileChange(e) {
      const file = e.currentTarget.files[0];
      const newWindow = window.open("https://pdx.tools");

      window.addEventListener("message", (e) => {
        if (e.data === "rakaly-loaded") {
          newWindow.postMessage(file, "*");
        }
      });
    }

    document.querySelector("input").addEventListener("change", fileChange);
  </script>
</body>
</html>
`}</pre>
      <h2 id="upload">Upload</h2>
      <p>
        To upload a file to Rakaly, it is easiest to run the {cli} which uses
        this same endpoint and does all the heavy lifting. If an API is still
        desired, below is the API endpoint:
      </p>
      <pre>POST https://rakaly.com/api/saves</pre>
      <p>
        All requests must be authenticated through{" "}
        <a href="https://en.wikipedia.org/wiki/Basic_access_authentication">
          basic auth
        </a>{" "}
        with your user id and API key.
      </p>
      <p>
        All requests must contain the "rakaly-filename" HTTP header which
        describes the filename of the uploaded files, as multipart/form-data is
        not officially supported by the API.
      </p>
      <p>
        The contents of the POST request will be the save. However, depending on
        how the save is encoded, some additional steps must be taken. For saves
        that are already a zip file, no additional steps are necessary and can
        be uploaded. Saves that are not in a zip, must be first compressed in a
        gzip-compatible format
      </p>
      <p>First, an example request to upload a save that is a zip file.</p>
      <pre>{`
curl "https://rakaly.com/api/saves" \\
  --header "rakaly-filename: ita1.eu4" \\
  --header "Content-Type: application/zip" \\
  --data-binary @ita1.eu4 \\
  --user ${uid}`}</pre>
      <p>An example request to upload save that is plaintext</p>
      <pre>{`
gzip < ita1.eu4 | curl "https://rakaly.com/api/saves" \\
  --header "rakaly-filename: ita1.eu4" \\
  --header "Content-Type: text/plain; charset=windows-1252" \\
  --header "Content-Encoding: gzip" \\
  --data-binary @- \\
  --user ${uid}`}</pre>
      <p>
        Setting the content type header to plain text is not required for the
        request to be accepted but is recommended to be future proof.
      </p>
      <p>Once uploaded, the server will return a response resembling:</p>
      <pre>{`
{
  "save_id": "xxx",
  "remaining_save_slots": 10,
  "used_save_slot": false
}`}</pre>
      <p>Field breakdown</p>
      <dl>
        <dt>save_id</dt>
        <dd>
          The unique identifier for the uploaded save. The save will be publicly
          hosted at /eu4/saves/xxx
        </dd>
        <dt>remaining_save_slots</dt>
        <dd>
          Informs the request how many save slots remain. By default all
          accounts have 100 save slots.
        </dd>
        <dt>used_save_slot</dt>
        <dd>
          Describes if the previous request consumed a save slot. Uploads
          consume a save slot if the save does not set a top 10 record for an
          achievement
        </dd>
      </dl>
      <p>
        If the file uploaded would consume a save slot but none are remaining,
        then an HTTP 400 response is returned.
      </p>
      <p>
        All API errors will return a JSON response that contains a user-friendly
        "msg" field.
      </p>
      <h2 id="melt">Melt</h2>
      <p>
        Melting is the process of converting a binary encoded (eg: an ironman
        save) into a plaintext save.
      </p>
      <p>
        To melt a save offline, one can use the {cli} or interface with{" "}
        <a href="https://github.com/rakaly/librakaly">librakaly</a>, which is a
        shared library that one can integrate with any programming language.
      </p>
      <p>There is no API endpoint for melting.</p>
    </PageHeader>
  );
};
