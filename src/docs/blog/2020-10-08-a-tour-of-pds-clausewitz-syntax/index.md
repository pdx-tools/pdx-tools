---
slug: a-tour-of-pds-clausewitz-syntax
title: A Tour of PDS Clausewitz Syntax
image: storm.png
authors: [comagoosie]
description: Paradox Development Studio (PDS) develops a game engine called Clausewitz that consumes and produces files in a proprietary format. This format is undocumented. I decided it would be worthwhile for myself as well as future developers interested in writing parsers to not only know the basics of this format but also the edge cases that I've encountered along the way.
---

<div style={{textAlign: "center"}}>
  <img alt="" width={512} height={170} src={require("./storm.png").default} />
</div>

Updated on: <time dateTime="2021-07-24">July 24th, 2021</time>

Paradox Development Studio (PDS) develops a game engine called Clausewitz that consumes and produces files in a proprietary format. This format is undocumented. I decided it would be worthwhile for myself as well as future developers interested in writing parsers to not only know the basics of this format but also the edge cases that I've encountered along the way.

<!--truncate-->

[Paradox Development Studio (PDS) develops a game engine called Clausewitz](https://en.wikipedia.org/wiki/Paradox_Development_Studio#Game_engines) that consumes and produces files in a proprietary format. This format is undocumented so I decided that it would be a good idea to showcase the happy path, but more importantly, edge cases so that anyone who is interested in writing parsers (myself included) can plan accordingly because there are a lot of parsers: [#1](https://github.com/ParadoxGameConverters/commonItems), [#2](https://github.com/nickbabcock/jomini), [#3](https://github.com/cwtools/cwtools), [#4](https://github.com/rakaly/jomini), [#5](https://github.com/Shadark/ClauseWizard), [#6](https://github.com/nickbabcock/Pfarah), [#7](https://github.com/primislas/oikoumene), [#8](https://github.com/nickbabcock/Pdoxcl2Sharp), [#9](https://github.com/fuchsi/clausewitz_parser), [#10](https://github.com/soryy708/ClauParse), [#11](https://github.com/rikbrown/klausewitz-parser), [#12](https://github.com/ClauText/ClauParser), [#13](https://gitgud.io/nixx/paperman), [#14](https://github.com/cormac-obrien/pdx-txt), [#15](https://github.com/cloudwu/pdxparser), [#16](https://github.com/scorpdx/ck3json), [#17](https://github.com/Osallek/Clausewitz-Parser), [#18](https://github.com/2kai2kai2/eu4img), [#19](https://github.com/crschnick/pdx_unlimiter), [#20](https://github.com/paimoe/eu4map), [#21](https://github.com/iTitus/PDXTools), [#22](https://github.com/mmyers/eug), [#23](https://github.com/jcranmer/eu4-save-helper). And these are the only ones I've found after a quick open source search!

So if anyone wants to write a parser for Europa Universalis IV, Crusader Kings III, Stellaris, Hearts of Iron IV, Imperator -- this should be a good starting point. Before getting started with the tour, I see some try and describe the format formally with [EBNF](https://en.wikipedia.org/wiki/Extended_Backus%E2%80%93Naur_form) and while this may be possible, reality is a bit more messy. The data format is undocumented and any parser will need to be flexible enough to ingest whatever the engine produces or can also ingest. 

To keep the scope of this post limited. We'll only cover the plain text format. The binary format used predominantly for save files will be for another time. How to write scripted game files encoded in the Clausewitz format won't be covered as this layer above Clausewitz is called Jomini and has [at least some documentation](https://forum.paradoxplaza.com/forum/threads/grand-jomini-modding-information-manuscript.1170261). As an aside, it's a bit frustrating or just unfortunate to be [an author of a Clausewitz parser also called Jomini](https://github.com/nickbabcock/jomini) that predates Paradox's implementation by several years. I guess naming is hard or great minds think alike!

Two things to keep in mind before we begin:

- This is a knowledge dump from someone who has no relationship with Paradox or the engine, so mistakes are possible
- This tour will focus on creating a superset of syntax pulled from several games. When producing data, make sure it's compatible with the intended game. Our goal is to be robust: liberal in what we consider valid and conservative in what we produce.

## The Tour

The simplest of examples can use [TOML](https://github.com/toml-lang/toml) syntax highlighting

```toml
# This is a line comment
cid = 1 # This is an inline comment
name = "Rakaly Rulz"
```

The above depicts a nice 1-to-1 key-value mapping that any language worth its salt can store in an ergonomic data structure.

But before we turn off syntax highlighting, let's visit the first edge case: duplicate and unordered keys

```toml
# This is a line comment
cid = 1 # This is an inline comment
name = "Rakaly Rulz"
cid = 2
```

In this case, `cid` wouldn't map to a singular value but instead to a list of values. This format is commonly seen in EU4 saves

But that's about as far as we can take syntax highlighting so future examples will be plain.

## Scalars

A value in a key-value pair that contains the smallest unit of measurement is called a scalar. Shown below is an example demonstrating a smattering of scalars.

```plain
aaa=foo         # a plain scalar
bbb=-1          # an integer scalar
ccc=1.000       # a decimal scalar
ddd=yes         # a true scalar
eee=no          # a false scalar
fff="foo"       # a quoted scalar
ggg=1821.1.1    # a date scalar in Y.M.D format
```

Some notes:

- A quoted scalar can contain any of other scalar (date, integers, boolean)
- A quoted scalar can contain any character including newlines. Everything until the next unescaped quote is valid
- A quoted scalar can contain non-ascii characters like "Jåhkåmåhkke". The encoding for quoted scalars will be either Windows-1252 (games like EU4) or UTF-8 (games like CK3)
- Decimal scalars vary in precision between games and context. Sometimes precision is recorded to thousandths, tens-thousandths, etc.
- Numbers can be fit into one of the following: 32 bit signed integers, 64 bit unsigned integers, or 32 bit floating point.
- Numbers can have a leading plus sign that should be ignored.
- Dates do not incorporate leap years, so don't try sticking it in your language's date representation.
- One should delay assigning a type to a scalar as it may be ambiguous if `yes` should be treated as a string or a boolean. This is more of a problem for the binary format as dates are encoded as integers so eagerly assigning a type could mean that the client sees dates when they expected integers.

Keys are scalars:

```plain
-1=aaa
"1821.1.1"=bbb
@my_var="ccc"    # define a variable
```

One can have multiple key values pairs per line as long as **boundary** character is separating them:

```plain
a=1 b=2 c=3
```

Whitespace is considered a boundary, but we'll see more.

Quoted scalars are by far the trickiest as they have several escape rules:

```plain
hhh="a\"b"      # escaped quote. Equivalent to `a"b`
iii="\\"        # escaped escape. Equivalent to `\`
mmm="\\\""      # multiple escapes. Equivalent to `\"`

# a multiline quoted scalar
ooo="hello
     world"

# Quotes can contain escape codes! Imperator uses them as
# color codes (somehow `0x15` is translated to `#` in the
# parsing process)
nnn="ab <0x15>D ( ID: 691 )<0x15>!"
```

## Arrays / Objects

Arrays and objects are values that contain either multiple values or multiple key-value pairs.

Below, `flags` is an object.

```plain
flags={
    schools_initiated=1444.11.11
    mol_polish_march=1444.12.4
}
```

And an array looks quite similar:

```plain
players_countries={
    "Player"
    "ENG"
}
```

And one can have arrays of objects

```plain
campaign_stats={ {
    id=0
    comparison=1
    key="game_country"
    selector="ENG"
    localization="England"
} {
    id=1
    comparison=2
    key="longest_reign"
    localization="Henry VI"
} }
```

## Operators

There are more operators than equality separating keys from values: 

```plain
intrigue >= high_skill_rating
age > 16
count < 2
scope:attacker.primary_title.tier <= tier_county
a != b
start_date == 1066.9.15
```

These operators are typically reserved for game files (save files only use equals).

## Boundary Characters

Mentioned earlier, what separates values are boundary characters. Boundary characters are:

- Whitespace
- Open (`{`) and close (`}`) braces
- An operator
- Quotes
- Comments

Thus, one can make some pretty condensed documents.

```plain
a={b="1"c=d}foo=bar#good
```

Which is equivalent to:

```plain
a = {
  b = "1"
  c = d
}
foo = bar # good
```

## Comments

Comments can occur at any location and cause the rest of the line to be ignored. The one exception is when
the comment occurs inside a quote -- treat it as a regular character:

```plain
my_obj = # this is going to be great
{ # my_key = prev_value
    my_key = value # better_value
    a = "not # a comment"
} # the end
```

## The Weeds

Now we get into the weeds and see more edge cases.

An object / array value does not need to be prefixed with an operator:

```plain
foo{bar=qux}

# is equivalent to `foo={bar=qux}`
```

A value of `{}` could mean an empty array or empty object depending on the context. I like to leave it up to the caller to decide.

```plain
discovered_by={} 
```

Any number of empty objects / arrays can occur in an object and should be skipped.

```plain
history={{} {} 1629.11.10={core=AAA}}
```

An object can be both an array and an object at the same time:

```plain
brittany_area = { #5
    color = { 118  99  151 }
    169 170 171 172 4384
}
```

The previous example showed how an object transitions to an array as seen in
EU4 game files. In CK3 there is the opposite occurrence as shown below: an
array transitions to an object. I colloquially refer to these as array
trailers (EU4) and hidden objects (CK3):

```plain
levels={ 10 0=2 1=2 }
# I view it as equivalent to
# levels={ { 10 } { 0=2 1=2 } }
```

Scalars can have non-alphanumeric characters:

```plain
flavor_tur.8=yes
dashed-identifier=yes
province_id = event_target:agenda_province
@planet_standard_scale = 11
```

Variables can be used in interpolated expressions:

```plain
position_x = @[1-leo_x]
```

Don't try to blank store all numbers as 64 bit floating point, as there are some 64 bit unsigned integers that would cause floating point to lose precision:

```plain
identity=18446744073709547616

# converted to floating point would equal:
# identity=18446744073709548000
```

Equivalent quoted and unquoted scalars are not always intepretted the same by EU4, so one should preserve if a value was quoted in whatever internal structure. It is unknown if other games suffer from this phenomenon. The most well known example is how EU4 will only accept the quoted values for a field:

```plain
unit_type="western"  # bad: save corruption
unit_type=western    # good
```

Victoria II has instances where unquoted keys contain non-ascii characters (specifically Windows-1252 which matches the Victoria II save file encoding).

```plain
jean_jaurès = { }
```

A scalar has at least one character:

```plain
# `=` is the key and `bar` is the value
=="bar"
```

*Unless* the empty string is quoted:

```plain
name=""
```

The type of an object or array can be externally tagged:

```plain
color = rgb { 100 200 150 }
color = hsv { 0.43 0.86 0.61 }
color = hsv360{ 25 75 63 }
color = hex { aabbccdd }
mild_winter = LIST { 3700 3701 }
```

The EU4 1.26 (Dharma) patch introduced parameter syntax that hasn't been seen in other PDS titles. From the changelog:

> Syntax is `[[var_name] code here ]` for if variable is defined or `[[!var_name] code here ]` for if it is not.

An example of the parameter syntax:

```plain
generate_advisor = {
  [[scaled_skill]
    $scaled_skill$
  ]
  [[!skill] if = {} ]
}
```

Objects can be infinitely nested. I've seen modded EU4 saves contain recursive events that reach several hundred deep.

```plain
a={b={c={a={b={c=1}}}}}
```

The first line of save files indicate the format of the save and shouldn't be considered part of the standard syntax.

```plain
EU4txt
date=1444.12.4
```

It is valid for a file to have extraneous closing braces, which can be seen in Victoria II saves, [CK2 saves](https://forum.paradoxplaza.com/forum/threads/all-save-files-have-an-unsightly-erroneous-trailing.706077/), and EU4 game files (looking at you verona.txt):

```plain
a = { 1 }
}
b = 2
```

And at the opposite end, it is valid for files to have a missing bracket:

```plain
a = { b=c
```

Semi-colons at the end of quotes (potentially lines) are ignored.

```plain
textureFile3 = "gfx//mapitems//trade_terrain.dds";
```

*Sometimes* a file will let you know its encoding with a [UTF-8 BOM](https://en.wikipedia.org/wiki/Byte_order_mark).

Save files can reach 100 MB in size and reach over 7 million lines long, so any parser must have performance as a focus.

## The Deep End

This section contains examples that contradict other examples. Due to the nature of Clausewitz being closed source, libraries can never guarantee compatibility with Clausewitz. From what we do know, Clausewitz is recklessly flexible: allowing each game object to potentially define its own unique syntax. The good news is that this fringe syntax is typically isolated in a handful of game files.

There are unmarked lists in CK3 and Imperator. Typically lists are use brackets (`{`, `}`) but those are conspicuously missing here:

```plain
simple_cross_flag = {
  pattern = list "christian_emblems_list"
  color1 = list "normal_colors"
}
```

Alternating value and key value pairs. Makes one wish they used a bit more of a self describing format:

```plain
on_actions = {
  faith_holy_order_land_acquisition_pulse
  delay = { days = { 5 10 }}
  faith_heresy_events_pulse
  delay = { days = { 15 20 }}
  faith_fervor_events_pulse
}
```

In direct constrast to the example above, some values need to be skipped like the first `definition` shown below.

```plain
pride_of_the_fleet = yes
definition
definition = heavy_cruiser
```

I don't expect any parser to be able to handle all these edge cases in an ergonomic and performant manner.

## Conclusion

With all these edge cases, a parser needs to be flexible. There are many ways to parse data, and I won't say which one is correct. In the list of open source parsers there's a good mix of regular expressions, parser generators, pull parsers, push parsers, dom parsers, and my favorite: [tape parsers](https://github.com/simdjson/simdjson/blob/4d2736ffa91c5ff072d1ab93241ee399892707d4/doc/tape.md). Which is the best approach may come down to the specific situation.

Good luck!
