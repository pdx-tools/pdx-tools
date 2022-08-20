---
slug: rakaly-status-report-12-next-level-compression
title: "Rakaly Status Report #12: next level compression"
image: banner.jpg
authors: [comagoosie]
description: "Optimizations found in how saves are uploaded, downloaded, and stored at rest resulted in a **2-3x** reduction in bandwidth and up to a **2x** reduction in time to parse shared saves. This benefits all Rakaly users as this made it easy to **increase the save limit from 10 to 100**. For those interested in the technical details: keep reading."
---

<div style={{textAlign: "center"}}>
  <img alt="" width={512} height={288} src={require("./banner.jpg").default} />
</div>

Optimizations found in how saves are uploaded, downloaded, and stored at rest resulted in a **2-3x** reduction in bandwidth and up to a **2x** reduction in time to parse shared saves. This benefits all Rakaly users as this made it easy to **increase the save limit from 10 to 100**. For those interested in the technical details: keep reading.

<!--truncate-->

EU4 save files come in three forms:

- uncompressed windows-1252 encoded plaintext
- zip file of the said plaintext document partitioned into a few files
- zip file but now the contents use the binary format

Previously Rakaly was uploading the zip files as is while gzipping the plaintext. This method has some nice properties: mainly those uploading zips don't need to preprocess the upload at all. But upon closer inspection, the generated zip files are poorly compressed and leave a lot to be desired. Since some saves are shared with many others, it would benefit all if the bandwidth needed to upload and download was reduced.

The solution is to use a modern compression algorithm called [brotli](https://brotli.org/). I sampled a few saves and found it compressed 2x better than gzip and 3x better than zips. Since brotli only performs compression, we needed an archival format where one can store files. That's where [`tar`](https://en.wikipedia.org/wiki/Tar_(computing)) comes into view. In short, when a user uploads a save, we extract the files from the zip and place them into a tar file before the entire payload is brotli compressed. Everything should be transparent without the user ever needing to know about this format.

This is a backwards compatible change. Previously uploaded saves remain in their original form and can continued to be parsed. 3rd party apps using the API can continue to transmit plain zips and gzips. The Rakaly CLI has been updated to take advantage of this new scheme, so it is recommended to upgrade for those that upload files through it.

To explain where the beforementioned parsing performance gains come from, browsers don't natively understand zip files. To them, zip files are just a blob to be passed along to Rakaly which implements unzip. Contrast that with brotli, which browsers do [natively understand](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Content-Encoding). Browsers are able to decompress the save at the speed of native hardware instead of Rakaly needing to reimplement it inside the browser environment. Now Rakaly only needs to concern itself with parsing and not decompression, hence the performance improvement. Most won't see a dramatic 2x improvement, but hopefully it is still tangible.

There are some discovered downsides, but they don't seem too major:

- Time to start uploading has been delayed as users need to perform the compression before uploading, instead of relying on blindly being able to upload zipped saves. Total times to upload may decrease for those on slower connections.
- Clicking "Download" on a save will no longer produce a carbon copy of what was uploaded. Instead, a repackaged zip will be produced. Initially I thought carbon copies were a desirable feature, but once I realized that repackaged zips are 20% smaller, repackaging seemed like a good idea anyways. These repackaged zips can still be continued in game.
- One nice properties of zip files that will be lost is that one can extract piecemeal bits, like only the metadata, without needing to decompress the entire save. Since we always use the entire save, this is not a large drawback.

There is potential for further improvement. If one cranks up the quality of the brotli compression to the max, we can achieve under 1 MB files. The tradeoff is that compressed output shouldn't be expected in real time. A compromise would be for users to upload compressed enough saves and then have an offline system that compress them further.

Enjoy!