---
slug: thoughts-on-converting-pds-clausewitz-syntax-to-json
title: "Thoughts on Converting PDS Clausewitz Syntax to JSON"
image: ./plant.jpg
description: "After one is familiar with the PDS Clausewitz syntax, it becomes almost too tempting to try and convert it to JSON as both are document formats that share a lot of similarities, except the former is a undocumented format and the other is the world's most popular data interchange format. There are a lot of nuances in the conversion between the two, so I figured I'd take the time and do a brain dump of my thoughts."
---

<div style={{textAlign: "center"}}>
  <img alt="" width={512} height={252} src={require("./plant.jpg").default} />
</div>

After one is familiar with the [PDS Clausewitz syntax](/blog/a-tour-of-pds-clausewitz-syntax), it becomes almost too tempting to try and convert it to JSON as both are document formats that share a lot of similarities, except the former is a undocumented format and the other is the world's most popular data interchange format. There are a lot of nuances in the conversion between the two, so I figured I'd take the time and do a brain dump of my thoughts.

<!--truncate-->

## The Easy Case

Let's start with the easy case -- the document below.

```plain
foo=bar
mynum=10
mybool=no
myobj={
  prop=erty
}
myarr={1 2}
```

Should easily converted into JSON:

```json
{
  "foo": "bar",
  "mynum": 10.0,
  "mybool": false,
  "myobj": {
    "prop": "erty"
  },
  "myarr": [1.0, 2.0]
}
```

It's a pretty simple 1-to-1 mapping. Both formats contain strings, objects, arrays, numbers, and boolean. Very ergonomic and intuitive for end users.

Unfortunately, we'll soon see we're a bit at the limits.

## Encoding

Text values extracted from a Clausewitz file should not be written blindly to JSON, as [JSON has a default encoding of UTF-8](https://tools.ietf.org/html/rfc7158#section-8.1), and Clausewitz files could be Windows-1252 or UTF-8. The Clausewitz files encoded in Windows-1252 will need to be converted to UTF-8 before being written out.

## Numbers

Numbers in the Clausewitz format can be represented as any of the following:

- 32 bit signed integer
- 64 bit unsigned integer (32 bit unsigned integer included here)
- 32 bit floating point

Here are some examples of those numbers:

```plain
-1000
18446744073709547616
1.000
```

JavaScript, and by extension JSON (JavaScript Object Notation), do not have distinct types for integers and floating point values. If stored as a floating point number, Javascript loss precision on the second number which would be equivalent to:

```plain
18446744073709548000
```

Interestingly, it is not invalid to write out numbers of an arbitrary precision. So in an isolated environment, one can format numbers according to their own requirements. However, if one of the goals is compatibility we should strive to meet the lowest common denominator, which is an environment that only recognizes 64 bit floating point numbers in JSON. 

There are three solutions:

1. Disregard compatibility and inform clients that numbers could be 64 bit floating point or 64 bit unsigned, so their parser must accommodate that possibility (a 64 bit float can accurately represent all possible 32 bit signed integers)

```json
[
  -1000,
  18446744073709547616,
  1.0
]
```

2. Write all numbers as strings. No loss of precision possible but the output is not very ergonomic. The client, if using a bare bones parser like `JSON.parse`, would be required to write an additional step to parse the desired numbers from strings.

```json
[
  "-1000",
  "18446744073709547616",
  "1.000"
]
```

3. Only write out numbers that would cause a loss of precision if converted to floating point as strings. Since 64 bit unsigned integers that can't be represented perfectly by 64 bit floating point are rare, this should strike a good balance between ergonomics and precision.

```json
[
  -1000,
  "18446744073709547616",
  1.0
]
```

4. Embed a schema designating the type, the raw value, and the compatible version. This method is way too verbose and I caution anyone from going down this route. Below is what it would look like for just one element from our example.

```json
[{
  "type": "u64",
  "raw": 18446744073709547616,
  "val": "18446744073709547616"
}]
```

What we see here and what we'll continue seeing is that there is no obviously correct answer. I'm partial to solution 3 as that seems to blend compatibility and ergonomics, but it's also understandable if someone else prefers another. 

## Key Order

Many associative arrays, dicts, or maps that json objects are parsed into don't preserve keys in insertion order. So if we had the below document:

```plain
b=1
a=2
```

One would not be able to assume that `b` comes before `a` when that object is iterated over.

There are two solutions:

1. Dictate to the client that they must deserialize into an insertion order preserving structure if they care about key order.
2. Format objects as an array of key value pairs. This comes at a small cost to ergonomics as we need a wrapper type to differentiate objects which are now arrays of key value pairs and regular arrays:

```json
{
  "type": "obj",
  "val": [
    ["b", 1],
    ["a", 2]
  ]
}
```

## Duplicate Keys

Duplicate keys are a common occurrence in Clausewitz files:

```plain
core="AAA"
prop=erty
core="BBB"
```

There are a few ways this can be translated into JSON:

1. Keep the duplicate keys as is, though it is [debatable if it is considered valid JSON](https://stackoverflow.com/a/23195243/433785), so expect client support to be low:

```json
{
  "core": "AAA",
  "prop": "erty",
  "core": "BBB",
}
```

2. Aggregate duplicate keys into an array. This has the benefit of transforming the data into an array structure that the user anticipates anyways with values ordered by how they appear. The downside is that if a duplicate key appears only once then it won't be automatically converted into an array (and requires additional steps by the user to ensure that all values expected to be arrays are in fact arrays):

```json
{
  "core": ["AAA", "BBB"],
  "prop": "erty"
}
```

3. Format the object using the same key value technique shown in the [key order section](#key-order), so that duplicate keys just become ordinary values in an array.

## Operators

Operators are not natively understood by JSON:

```plain
intrigue >= high_skill_rating
```

Couple solutions:

1. Convert the operator to a wrapper object:

```json
{
  "intrigue": {
    "GREATER_THAN_EQUAL": "high_skill_rating"
  }
}
```

2. Expand the key value array to be key-operator-value array

```json
{
  "type": "obj",
  "val": [
    ["intrigue", ">=", "high_skill_rating"],
  ]
}
```

Ideally the chosen solution would not negatively impact the vast majority of `key=value` properties. 

## Headers

Headers are not natively understood by JSON:

```plain
mycolor = rgb { 10 20 30 }
```

Again, couple of solutions:

1. Convert the `rgb` to a wrapper object

```json
{"mycolor": { "rgb": [10, 20, 30] } }
```

2. Set `rgb` as the type (or maybe introduce another field):

```json
{
  "type": "obj",
  "val": [
    ["mycolor", {
      "type": "rgb",
      "val": [10, 20, 30]
    }],
  ]
}
```

## The Experiment

I took the time to publish this JSON generation as an experiment as part of the [JS bindings to jomini](https://github.com/nickbabcock/jomini). It allows one to convert a Clausewitz file to JSON quite easily:

```js
const out = parser.parseText(
  buffer,
  { encoding: "windows1252" },
  (q) => q.json()
);
```

The thought is that all the potential solutions that we talked about will be options that one can pass to the JSON function, as there doesn't appear to be a clear winner in every situation:

```js
// Print duplicate keys separate instead
// of aggregating them into an array
const out = parser.parseText(
  buffer,
  { encoding: "windows1252" },
  (q) => q.json({ disambiguate: "keys" })
);
```

We'll see what shakes out, as I'm expecting some things will need to change.

## TODO

Here are some open questions that I do not have the answers to.

### Writing and the Question of Losslessness

Parsing is only one half of the equation. It's logical to expect users would want to write data as well. Users could receive the JSON, modify a single value, and then pass the newly modified JSON to have it converted back to the Clausewitz syntax.

This is a tough task as one first needs to preserve value semantics. This can best be seen in strings where a string can be quoted or unquoted:

```plain
unit_type="western"  # bad: save corruption
unit_type=western    # good
```

So while one's language of choice is fine viewing both unquoted and quoted as just strings, it's important to the game that quote behavior is preserved.

Now one is faced with the unsavory decision of potentially sacrificing ergonomics in order to convey this information:

```json
{
  "unit_type": {
    "type": "unquoted",
    "val": "western"
  }
}
```

It's not bad, but it's not great, as this would cause the JSON to balloon in size as both keys and values would need type information:

```json
{
  "type": "obj",
  "val": [
    [{
      "type": "unquoted",
      "val": "unit_type"
    }, {
      "type": "unquoted",
      "val": "western"
    }]
  ]
}
```

Ah yes, a 10x in output size compared to the original one liner. This size increase could easily be stomached for smaller files but when you have a 100 MB save, it seems awfully silly to require 1 GB to represent values losslessly.

There is a further stage of losslessness that we haven't touched on: preserving trivia such as comments and whitespace (terminology adapted from [Swift's libsyntax](https://github.com/apple/swift/tree/main/lib/Syntax)). I think it would be extremely powerful to edit a single value in the json and then have only that change reflected once written out -- instead of the situation now where almost all Clausewitz file editors strip comments and reformat the file.

Losslessness is a tough task with a lot of sacrifices (ergonomics and performance). It's hard to stomach the thought of maintaining two parsers: one for performance and one for fidelity, but I don't have a better idea at the moment. Who knows maybe by 2030 it'll be a solved problem.

### Object Trailers

Object trailers are unsolved and difficult to deal with as a value is both an object an array:

```plain
foo={
  a=b
  1 2 3
}
```

Perhaps it is possible to lift the trailer to the wrapper type?

```json
{
  "type": "obj",
  "val": [
    ["foo", {
      "type": "obj",
      "val": [
        ["a", "b"]
      ],
      "trailer": [1, 2, 3]
    }]
  ]
}
```

Still mulling this over

## Prior Work

I'm not the first to ponder converting Clausewitz files to JSON, nor will I be the last:

- cwtools wants to [output and ingest JSON](https://github.com/cwtools/cwtools/issues/22) and discussed a some of the issues / solutions seen here 
- [irony](https://github.com/bcssov/IronyModManager) can produce JSON in a format that parallel to the lossless version
- [LibCK3](https://github.com/scorpdx/LibCK3) is tailored to CK3 and focussed more on size and ergonomics than losslessness
- [pdxu](https://github.com/crschnick/pdx_unlimiter) stores extracted save data as json

## No More Handwritten Parsers?

What's the goal of this post? Why did I spend all afternoon writing this?

I believe that there would be more community written projects if Clausewitz files were more accessible. And I can't help but wonder if exposing Clausewitz files as JSON is the right approach.

There is precedent for an accessible intermediate format, as that is how the Rocket League community works. The Rocket League replay format is so difficult and ever changing there are only a handful of libraries that can keep pace. These libraries parse the file and output JSON, which a number of downstream projects ingest. Even here there's a battle between formats that are lossless or ergonomic and performant (with the lossless format seemingly the less popular option) 

It doesn't seem far fetched that something like this would be possible for Clausewitz files. Considering that there is [librakaly](https://github.com/rakaly/librakaly) for C interop, [rakaly-cli](https://github.com/rakaly/cli), rakaly the web site, and [JS bindings](https://github.com/nickbabcock/jomini), exposing JSON generation in rakaly would allow it to be usable in any situation.
