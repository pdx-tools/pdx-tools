import { promisify } from "util";
import os from "os";
import crypto from "crypto";
import path from "path";

export const tmpDir = process.env["TMPDIR"] || os.tmpdir();

// Get random, temporary file name. Same algorithm used by multer:
// https://github.com/expressjs/multer/blob/4f4326a6687635411a69d70f954f48abb4bce58a/storage/disk.js#L7-L11
const randomBytes = promisify(crypto.randomBytes);
export const tmpPath = () =>
  randomBytes(16)
    .then((x) => x.toString("hex"))
    .then((x) => path.join(tmpDir, x));
