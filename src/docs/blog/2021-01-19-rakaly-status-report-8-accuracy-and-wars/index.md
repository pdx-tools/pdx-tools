---
slug: rakaly-status-report-8-accuracy-and-wars
title: "Rakaly Status Report #8: Accuracy and Wars"
image: ./war-banner.png
authors: [comagoosie]
description: |
    A good amount of work when into this status report. Some highlights: 

    - A new war screen where one can get the overview and drill down to specific battles
    - A players screen so one can quickly see who is playing which country in a multiplayer game
    - A engine that allows for more accurate visualizations across tag switches
---

<div style={{textAlign: "center"}}>
  <img alt="" width={512} height={205 } src={require("./war-banner.png").default} />
</div>

Highlights:

- A new war screen where one can get the overview and drill down to specific battles
- A players screen so one can quickly see who is playing which country in a multiplayer game
- A engine that allows for more accurate visualizations across tag switches

<!--truncate-->

## Wars and Battles

[![Screenshot of the new War Info screen](war-info-1.png)](war-info-1.png)
*Screenshot of the new War Info screen*

In the war info screen:

- Easily filter to wars that involved players or PvP wars
- Drill down into the war to for an overview and list of battles
- Breakdown casualties and participation per side
- Easily see when country join or exit a war
- View stats of battle commanders

[![Screenshot of the new Battles table](war-info-2.png)](war-info-2.png)
*Screenshot of the new Battles table*

This proved quite the challenging feature to implement, as I had been lazy early on when it came to mapping the course of a nation's trajectory through tag switches. [See my previous post for a bit more background](/blog/tracking-tag-switches-in-eu4-save-files).

Tracking tag switches is especially important if one wants an accurate war info screen. To illustrate imagine a battle defender:

```plain
defender={
    artillery=4000
    infantry=36000
    losses=8231
    country="BYZ"
    war_goal=3
    commander="Leon Tornikes"
}
```

See that "BYZ" (Byzantium) is the country. If we wanted to look up the commander (eg: to find his fire pips and such) we need to know which Byzantium to search for. It may seem like an odd notion that there could be multiple Byzantiums, but it's possible. There is a Byzantium at the start of 1444 but they are quickly annexed by the hungry ottomans. Another country could form Byzantium later through tag switching. When this tag switch happens, the initial Byzantium's history (including a history of their generals) is relocated to the latter's original tag.

So I set to work on rewriting the query engine to better follow tag switching, annexations, and releasing of countries.

## More Accuracy

To visualize this improvement in accuracy let's look at a deficiency in the old version of Rakaly. Below is a true heir of timur run where the player tag switched from Sistan to Delhi and then immediately from Delhi to Mughals. Since Delhi exists at the start, there would be multiple concurrent data points for monthly income even though that shouldn't be possible when playing single player.

[![Old version of Rakaly couldn't track tag switches properly](monthly-income-bad.png)](monthly-income-bad.png)
*Old version of Rakaly couldn't track tag switches properly*

This is no longer a problem with the update

[![New version of Rakaly that knows exactly when tag switches happen](monthly-income-good.png)](monthly-income-good.png)
*New version of Rakaly that knows exactly when tag switches happen*

## Players View

Sometimes it's nice to have an overview of the multiplayer lobby to answer the following:

- Who is playing which country
- Any tag switches that occurred in the game
- What players have been annexed
- What players have left the lobby

A player view was added to answer those questions

[![New players view](players-view.png)](players-view.png)
*New players view*
