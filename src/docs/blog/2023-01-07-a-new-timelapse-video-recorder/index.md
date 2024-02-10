---
slug: a-new-timelapse-video-recorder
title: "A new timelapse video recorder"
authors: [comagoosie]
image: ./banner.png
---

<div style={{textAlign: "center"}}>
  <img alt="" width={512} height={186} src={require("./banner.png").default} />
</div>

A major update has been pushed to how map timelapses work. Previously the video was
created by literally recording the screen. There ended up being several problems
with this.

<!--truncate-->

- The biggest problem is that it was impossible to sync the map with the
  requested framerate. In order to get a smooth timelapse, every frame needed to
  be rendered and recorded at the exact moment, and there is no way to guarantee
  this. Maybe the user's computer rendered the map too slow, or the recorder
  stopped recording (like if the user navigated away from the page). This
  resulted in significant jank, like years being skipped. 
- Not all media recorders worked the same way. Sometimes the recorders were slow
  to start and required repeatedly re-rendering the timelapse start until data
  was recorded. And this workaround could cause knock-on video artifacts.
- The recording can only progress at the requested framerate. This means those
  with fast computers would have their computers twiddling their thumbs in
  between frames.

The solution to these problem is to migrate to the
[`VideoEncoder`](https://developer.mozilla.org/en-US/docs/Web/API/VideoEncoder)
API, which allows the browser to precisely stitch together individual frames
that we have direct control over. Unfortunately,
[`VideoEncoder`](https://caniuse.com/mdn-api_videoencoder) has limited browser
support with only Chrome, Edge, and Opera really supporting the feature. This
represents 75% of pdx tools users. Ideally it'd be 100%, but the hope is that
those on non compatible browsers (like firefox) are able to easily switch when
they want to create a timelapse.

In a bit of irony, for several months, Chrome was barred from recording timelapses due [a bug](https://bugs.chromium.org/p/chromium/issues/detail?id=1357418) where the media recorder would never produce data and result in an infinite loop. Now Chrome is being recommended.

Ideally a browser without `VideoEncoder` support would fallback to recording the
screen, but it was deemed too difficult to maintain both solutions. Hopefully
the incompatibilities are worth it to have improved timelapse videos.

The good news is now that frame generation is decoupled from frame encoding, we
can relax some artificial constraints, like turning off terrain overlay, as
otherwise it would increase the chance of jank.

The decoupling also allows future feature development like, moving the video
generation into the background so that the map doesn't need to temporarily
resize. And once moved to the background, it'd be possible to create multiple
timelapses simultaneously, like a button to export all possible timelapses (only
political and religion map modes are supported at the moment). 