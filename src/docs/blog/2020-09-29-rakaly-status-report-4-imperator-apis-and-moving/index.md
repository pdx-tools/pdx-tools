---
slug: rakaly-status-report-4-imperator-apis-and-moving
title: "Rakaly Status Report #4: Imperator, APIs, and Moving"
image: water-banner.jpg
description: |
  It's been a few weeks since the last update as my time has been taken up by moving a household to a new city, but I have some tidbits in store:

  - Foundations laid for a user savefile query API
  - Improved the range of game files rakaly supports
  - Imperator parser
---

<div style={{textAlign: "center"}}>
  <img alt="" width={512} height={177} src={require("./water-banner.jpg").default} />
</div>

It's been a few weeks since the last update, and in that time frame I've moved to a new city. Moving a household can be time consuming so I took about a week vacation from programming, but I was also able to sneak in a few tidbits:

- Foundations laid for a user savefile query API
- Improved the range of game files rakaly supports
- Imperator parser

<!--truncate-->

Side note, I've been enjoying a relaxing EU4 game of Oman, building up a trade + vassal empire and it was nice to see a [reddit guide](https://www.reddit.com/r/eu4/comments/ixe31z/billbabbles_experts_guide_to_trade_for_real_doges/?utm_source=share&utm_medium=web2x&context=3) on trade which touched upon how overpowered Oman can be due to their unique 33% trade steering tradition.

## Query API Foundations

Rakaly will never be everything to everyone. There will always be some sort of data from a savefile that is not exposed to a user's liking. That could mean that the data is not optimally visualized or maybe I've yet to implement it, as I tend to program at a glacial rate (despite all spending all day programming).

To fix this, I want to expose an editor inside Rakaly where one can craft a query via a Javascript API. For instance, if someone wanted to retrieve a player's prestige from a single player game, they could write:

```js
// The save file is globally injected
const save = {};
const player = save.query("/player");
const playerPrestige = save.query(`/countries/${player}/prestige`);
return { prestige: playerPrestige }
```

The returned data could simply be printed out for a start. Then for more complex queries, either the data can be formulated into a csv for export or even piped right into one of Rakaly's visualizations.

I believe a query API would be a welcomed addition as having the same API over all saves (ironman and standard) as well as being the fastest and most complete EU4 parser available to the browser could make Rakaly one stop shop for EU4 players who are comfortable playing around with save files and know a bit of Javascript.

## Parser Improvements

More work has also gone in making the [underlying parser](https://github.com/rakaly/jomini) viable for parsing CK3, Stellaris, Imperator, etc game files. Save files tend to be simpler in comparison to game files where one can see operators other than equality: 

```plain
val < 3
val <= 3
val > 3
val >= 3
```

Or there's objects where 

```plain
color = hsv { 0.58 1.00 0.72 }
color = rgb { 169 242 27 }
color = hsv360 { 25 75 63 }
position = cylindrical { 150 3 0 }
color5 = hex { aabbccdd }
mild_winter = LIST { 3700 3701
    # ...
}
```

I've implemented all this additional syntax with only a negligible loss to performance. It's important to support this syntax as savefiles are not standalone. One can't compute discipline, trade steering, or anything that incorporates modifiers without looking or parsing the game files. And while EU4 game files don't use any complicated syntax, it's important (to me at least) that all PDS games use the same set of logic.

## Imperator

On the topic of other PDS games, I created a repo for parsing [imperator saves](https://github.com/rakaly/imperator-save). While I haven't played imperator longer than necessary to create a savefile, I realized that Rakaly could be beneficial to almost all Imperator players because there is only one type of save format and it's binary. This means that one isn't able to open up their normal playthrough and inspect the file for themselves.

It is possible for one to create plain text saves by launching Imperator with `-debug_mode`, but this is not user friendly.

Right now the only feature implemented for Imperator is being able to convert it from binary to plain text for the [Paradox Game Converters](https://github.com/ParadoxGameConverters/ImperatorToCK3) project, but I'm happy to improve on this 