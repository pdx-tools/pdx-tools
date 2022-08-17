---
slug: tracking-tag-switches-in-eu4-save-files
title: "Tracking Tag Switches in EU4 Save Files"
banner: tag-plants.jpg
authors: [comagoosie]
description: "In EU4, when one forms another country or changes their country ID, it is called tag switching. The implications for tag switching is important to understanding the course of events. Countries come, go, and can reappear so it's important to differentiate players. EU4 save files record tag switches (with some edge cases!), and this post will be about following the changes in tags in a given playthrough."
---

<div style={{textAlign: "center"}}>
  <img alt="" width={512} height={205} src={require("./tag-plants.jpg").default} />
</div>

In EU4, when one forms another country or changes their country ID, it is called tag switching.

To give an example, if one starts off as the Tyronian Irish chiefdom, which is identified by the `TYR` tag, and then unites the island, the player can opt to tag switch to Ireland, which is identified by `IRE`. This is just one form of tag switching.

<!--truncate-->

The implications for tag switching is important to understanding the course of events. Countries come, go, and can reappear so it's important to differentiate players (whether human or AI). 

EU4 save files record tag switches (with some edge cases!), and this post will be about following the changes in tags in a given playthrough.

## Basics

The first step is to identify:

- The year the playthrough started
- The current date
- The player country tag

These all can be seen in the following snippet from the save file:

```plain
date=1769.1.6
players_countries={ "Player" "GBR" }
start_date=1444.11.11
```

The above shows that I'm playing as Great Britain. If this was a multiplayer playthrough, the even indices would be player names while odd would signal that player's country tag (keep in mind that more than one player can be assigned to a country).

We then find our country in the countries section of a save file:

```plain
countries={
  GBR={
    human=yes
    history={
      # snip ...
    }

    # snip ...
  }
}
```

It should be pretty easy to find as the human tag will signal that a player is currently operating the country.

The history section contains the key info.

```plain
history={
   1518.1.29={
    changed_tag_from="TYR"
   }
   1606.8.4={
    changed_tag_from="IRE"
   }
}
```

In the context of our example the above would be interpreted as:

- The player started as Tyrone (TYR) in 1444
- The player formed Ireland (IRE) in 1518
- The player formed Great Britain (GBR) in 1606

The algorithm I like is to start at the very end of the history. We know we're Great Britain at our current save date of 1769. Traversing the history backwards, we see that we were Great Britain starting in 1606 when we switched from Ireland. Continue traversing until we're at the start of the history.

If calculating the exact dates is too tedious, one can approximate operators by examining other values for Great Britain:

```plain
previous_country_tags="TYR"
previous_country_tags="IRE"
```

Lacking dates can be problematic.

## So Cilli

It is not uncommon for one to form a country that previously existed. For instance, one can start as the country of Cilli and form Croatia (by declaring war for croatian provinces and culture shifting) to complete an achievement. The confounding variable is that Croatia exists at the start of the game. Without the context that dates provide it can easily look like the player declared war on themselves!

Also the previous operator's history is stored under the player's initial tag. So when the player forms Croatia as Cilli, the initial Croatia player's history is stored in Cilli's history. This way interesting tidbits are not lost to history when a country is reformed. I'm not 100% confident in this behavior, but this pattern has held up in the save files I've inspected.

## Multiple Tag Switches in One Day

It is possible form multiple countries in one day:

```plain
history={
  1518.1.29={
    changed_tag_from="TYR"
    changed_tag_from="IRE"
  }
}
```

They are still ordered, so the player first was Tyrone and then formed Ireland and then immediately formed Great Britain. 

## Release and Play As Deficiency

Here is where the shortcomings of the save format are exposed:

There is no record of when a player releases a vassal and decides to continue playing as that vassal.

It's a bummer, but this behavior can be confirmed by looking at EU4 achievements that are completed using this release and play as (eg: Empire of Mann and Stiff Upper Lippe). These achievements don't have limitations on starting tags or culture because the game itself doesn't know who the player started as.

The good news is that it is detectable if a player has changed nations by playing as a released vassal by examining their country for `has_switched_nation`.

```plain
countries={
    ALE={
        human=yes
        has_switched_nation=yes
    }
}
```

One may be able to employ heuristics like detecting overlord or in the absence of an overlord, tracking down an independence war or a cancel vassal peace deal.

Else not too much more can be done other than shrug and hope that the player didn't lose too much of their history. 
