---
slug: rakaly-status-report-3-crusader-kings-iii
title: "Rakaly Status Report #3: Crusader Kings III"
image: ./rockies.jpg
description: "Crusader Kings III was released 10 days ago. And for 10 days I've lost myself in adding support for CK3 saves and improving the core parser. It started out as a \"I wonder how close CK3 saves are to EU4 saves\" experiment. Initial testing showed they were quite close so I kept pushing to completion, but I'd always be tripped up by a new syntax or encoding. I'm pleased to announce that I have the CK3 syntax under control and the core parser walks away faster and more robust than before."
---

<div style={{textAlign: "center"}}>
  <img alt="" width={512} height={194} src={require("./rockies.jpg").default} />
</div>

Crusader Kings III was released 10 days ago. And for 10 days I've lost myself in adding support for CK3 saves and improving the core parser. It started out as a "I wonder how close CK3 saves are to EU4 saves" experiment. Initial testing showed they were quite close so I kept pushing to completion, but I'd always be tripped up by a new syntax or encoding. I'm pleased to announce that I have the CK3 syntax under control and the core parser walks away faster and more robust than before.

<!--truncate-->

One can find the [ck3save library open sourced and on Github](https://github.com/rakaly/ck3save). It resembles more of a skeleton at the moment!

## New CK3 Format

### UTF-8

CK3 uses UTF-8 to encode quoted strings, while EU4 uses Windows-1252. For everyone out there who is not an encoding expert, the difference between these two code pages is that UTF-8 can represent characters from all alphabets around the world instead of the euro-centric Windows-1252 (and even then, it's lacking many characters).

This means that the ck3 can properly represent

```plain
Chiefdom of Jåhkåmåhkke
```

whereas EU4 would call it

```plain
Chiefdom of Jahkamahkke
```

This is good news for players! Bad news for programmers wanting to support both Windows-1252 and UTF-8 formatted saves. Thankfully UTF-8 is the best choice PDS could have gone with as, without going to into the details, we can take advantage of the backwards compatibility of UTF-8 to push how the data should be decoded to the caller (in this case the code that extracts either EU4 or CK3 saves).

### Hidden Objects

Below is a common object for denoting a character's levels:

```plain
levels={ 10 0=2 1=2 }
```

It's a mix between a sequence of numbers and an object of key value pairs. I've been affectionately referring to these as "hidden objects", as they are objects hiding inside arrays.

Rakaly takes care of this by interpreting it as if it was written:

```plain
levels={ 10 { 0=2 1=2 } }
```

In which case it would be read "levels is an array with the first element being numeric and second one being an object".

This has caused an issue with melting as ideally Rakaly would be able to translate back to the hidden object format, but that is still a todo item.

Ideally paradox doesn't derive more frankenstein formats from this. Keep it simple.

### Binary Rational Values

Aside from hidden values and character encodings, the binary format stayed the same, or so I thought. EU4 and CK3 represent rational values (ie: values with fractions) in binary differently. From up high, the two binary formats look similar, but it's only until one compares the values from a CK3 plain text save to a CK3 binary save that one realizes the values are wildly off (eg: having a character that is hundreds of thousands years old).

Cue me spending an hour or two trying to come up with the functions that mapped arbitrary data to an expected value. Eventually, trial and error paid off

## Speed and Robustness

Over time as Rakaly has gotten more powerful in exposing or querying data from EU4 saves and now being flexible enough to ingest CK3 saves, this has come at a cost. Specifically performance and robustness.

It's always been a point of pride for me to have rakaly be fast *and* safe:

- fast enough that users never think their browser has frozen
- fast enough that the user doesn't feel the inclination to navigate away from the page.
- safe in that given any input, data will either be extracted or there'll be a handled error

Anyways in the coding spree that has been the last month, things had gotten a bit slower and testing malicious input locally could cause less than desirable results (infinite loops / out of memory errors). I then made this week a week for performance and stability. Running dozens of benchmarks and fuzzing against billions of inputs.

The results were fantastic. Rakaly has never been faster (parsing binary saves up to 1.2 GB/s) and it's once again sealed against malicious inputs. And while one couldn't upload anything malicious anyways, as it wouldn't be a record breaking ironman save, it cements the foundation for opening up the gates for all saves.

## Conclusion

My first act of understanding the CK3 save format was to give the ability of converting CK3 ironman saves to the standard format to the [Paradox Game Converters](https://github.com/ParadoxGameConverters/CK3toEU4) project. One day I hope to build on this so that these converted saves are seamlessly playable.

Other than that, my only experience with the Crusader Kings franchise is the 5 hours that I've put in over the last 10 days with CK3, so I'd say I'm not too familiar with the game. I don't know what I (or others) want to see from their CK3 saves, but I've laid the foundation in case I want to add a "CK3" tab to the Rakaly. If you have a suggestion, feel free to discuss it in the Discord!

Also if someone has a cloning machine so that one version of me can work on the frontend and the other can work on the backend, let me know 😆
