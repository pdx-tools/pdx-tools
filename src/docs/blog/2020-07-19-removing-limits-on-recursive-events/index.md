---
slug: removing-limits-on-recursive-events
title: "Removing Limits on Recursive Events"
image: rakaly-mana-chart.png
authors: [comagoosie]
description: "EU4 events can be recursive, meaning that an event can be defined in and of itself. A great example of this is the Oxford Symposium event for England / Great Britain where every 10 years the event has a different option than the previous iteration. Previously Rakaly restricted how nested this event could become, but a new method was implemented to allow an unlimited depth."
---

<div style={{textAlign: "center"}}>
  <img alt="" width={505} height={237} src={require("./rakaly-mana-chart.png").default} />
</div>

EU4 events can be recursive, meaning that an event can be defined in and of itself. A great example of this is the [Oxford Symposium event](https://eu4.paradoxwikis.com/English_events#flavor_eng.9880) for England / Great Britain where every 10 years the event has a different option than the previous iteration. Previously Rakaly restricted how nested this event could become, but a new method was implemented to allow an unlimited depth.

<!--truncate-->

All great news, but let's examine in a bit more in detail.

Below is an example of the previously mentioned symposium event encoded in a save:

```
delayed_event={
 event="flavor_eng.9880"
 days=3199
 scope={
  country="GBR"
  scope_is_valid=yes
  seed=57955.08.26
  random=57955.08.26
  from={
   country="GBR"
   scope_is_valid=yes
   seed=13753.12.05
   random=13753.12.05
   from={
    country="GBR"
    scope_is_valid=yes
    seed=18494.05.24
    random=18494.05.24
    from={
     country="GBR"
     scope_is_valid=yes
     seed=3491.04.17
     random=3491.04.17
     # etc ...
    }
   }
  }
 }
}
```

The most striking feature of this snippet is that it increasingly becomes
indented. Every decade when the event occurs the list is intended once more.
This can continue ad infinitum -- really only being limited by the EU4 end
date. If the event fires every 10 years, then it would be unusual for this
event to fire more than (1821 - 1444) / 10 = ~37 times.

Initially, Rakaly only allowed 15 layers of nested events, but this quickly
proved inadequate for many late game Great Britain runs. I increased the limit
to 30 as I did not believe one could reasonably achieve more than 300 years of
symposiums.

As you can imagine by the title of this post, this didn't last for too long.
There are EU4 mods that create recursive events that fire every year instead of
every decade. Now all of sudden this could create data that is nested more than
300 times. Something had to change. While Rakaly doesn't cater to mods, Rakaly
should be able to at least parse these saves.

I spent a day investigating the possibilities and I'm pleased to report that
the solution found has had zero downsides, whether it's resource usage (speed /
RAM consumption) to code maintenance (more lines of code were deleted than
added).

The solution has been deployed to Rakaly and should be transparent. Though
since the core logic for parsing saves was updated, issues could have slipped
through that weren't detected by the usual fuzz run that tests Rakaly against a
billion inputs. If you encounter an issue, please report it.

## The Technical

For those that want the technical details, read on. First a bit of background.

Rakaly's parser writes to a contiguous tape of tokens. One can think of it as lexer with all the necessary context baked in -- it's a flattened document hierarchy. Great for performance (cache locality) with a decrease in memory usage. Tape based parsing is not a novel technique, but it seems rare. There is a nice description of how the tape works in [Daniel Lemire's simdjson](https://github.com/lemire/simdjson/blob/4d2736ffa91c5ff072d1ab93241ee399892707d4/doc/tape.md).

Initial versions of Rakaly used recursive descent parsing, but this is subject to stack overflows in the event of malicious input. Hence the move to tape parsing.

Previously there was a separate state tracking array that accompanied the
parser's tape. This array keeps track of the transition step after an object / 
array was terminated, as the parser needs to know what comes next (eg: is it an object's
key or an array's value?). Every level deeper into the data (a nested object,
array, etc) would cause another level of the array to be consumed. This array
had a limit (the 15 / 30 limit mentioned earlier).

The obvious fix would be to swap out a fixed length array for a growable one.
This worked but it came with a small but tangible performance and memory cost.

Then an idea came to me. The token tape used for parsing contains an end
pointer for each array and object (this way one can quickly hop around an
object). However, until the end of the object / array is reached, instead of
storing a blank for the end pointer, store a pointer to the start of the parent
object / array. This way when an object / array ends, we look up its
parent's type before filling in the end pointer with the correct value.

Now there is no limit to how deep events can be nested and previous state
tracking logic could be removed.
