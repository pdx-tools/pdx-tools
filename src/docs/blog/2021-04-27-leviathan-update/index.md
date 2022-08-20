---
slug: leviathan-update
title: "Leviathan Update"
image: drippy.jpg
authors: [comagoosie]
summary: "Rakaly now has support for Leviathan! You can analyze and upload Leviathan saves like normal. All prior uploads have an additional 10% tax added onto their in game time. There were some challenges in implementing Leviathan support due to changes in the save and game -- like wasteland terrain and monument dates"
---

<div style={{textAlign: "center"}}>
  <img alt="" width={512} height={252} src={require("./drippy.jpg").default} />
</div>

I'm excited to announce Rakaly has support for Leviathan! There were some interesting encounters along the way, but in the end, you can analyze and upload Leviathan saves like normal. In keeping with the decaying leaderboard, patch 1.29 has a 20% tax and patch 1.30 has a 10% tax to the number of days required to complete an achievement.

<!--truncate-->

In a way this is Rakaly's 1st patch birthday, as Rakaly was announced the week of the last patch, Emperor, a little under a year ago.

## Save Changes

There were some changes to the save data. The most exciting change is that negative development is captured:

[![Negative development is now represented in game](neg-dev.png)](neg-dev.png)
*Negative development is now represented in game*

More testing is needed to pinpoint what subset of actions represents negative development (concentrate development, pillaging (razing excluded)).

Another unfortunate aspect is that positive and negative development actions are summed together so now a country's contribution to a province can be 0 if it was pillaged (?) and then later developed by the pillager.

[![Positive and negative development cancel each other](zero-dev.png)](zero-dev.png)
*Positive and negative development cancel each other*

Ideally they'd be split into two to more accurately capture dev changes. 

The binary format (used for ironman and non-editable MP saves) had `migration_cooldown` renamed to `migration_cost`. This is unfortunate as the melter assumes that field names aren't patch dependent, so this is a heads up for those who melt an older save and see a new mechanic. I did check a few 1.30 and didn't find `migration_cooldown` so I'm optimistic that this issue will be rare.

Also monuments (known internally as great projects) implicitly extended the timeline as some monuments are built long before the 1444 start date:

```plain
pyramid_of_cheops={
    province=361
    development_tier=0
    date_built=-2570.1.1
    date_destroyed=1.1.1
}
```

The -2570.1.1 is a problem as dates and numbers are indistinguishable in the binary format as they are both stored as the same type. Rakaly had some heuristics to detect realistic dates, but these prehistoric monument dates avoided detection due to being such outliers (the previous record holder for oldest date was a monarch with a birth_date of -79.1.1). As always, a fix was found with additional code for context, but it certainly presented a speedbump.

Speaking of monuments, this is something I'm looking at exposing in Rakaly.

## Wasteland Terrain

What is concerning is that I use a runfile to export a list of province terrain by assigning each terrain to a certain nation. Below is a snippet showing how to assign every hill province to France in pre-1.31:

```plain
every_province = {
    limit = {
        has_terrain = hills
    }
    cede_province = FRA
}
```

Executing this runfile in 1.31 results in a crash with the following error:

```plain
Trying to set owner FRA on wasteland/lake province 2200
```

This is due to province 2200 (Suleiman Range) being impassable terrain (ie: a wasteland). The fix is easy enough, only assign non-wasteland hills to France.

```plain
every_province = {
    limit = {
        has_terrain = hills
        is_wasteland = no
    }
    cede_province = FRA
}
```

But this makes me nervous that this could impact the Eat your Greens achievement that requires one to own all grassland provinces as Kale as the achievement logic looks like:

```plain
owns_all_provinces = {
    continent = asia
    has_terrain = grasslands
}
```

And unless `owns_all_provinces` filters down to all ownable provinces then there is a chance that Eat your Greens is impossible to complete in Leviathan if it requires one to own wasteland provinces.

## Achievements Changelog

Didn't see some of these documented, so here you go:

  - No Trail of Tears:
    - Now requires embracement of industrialization
  - Turning the Tide:
    - Now requires embracement of industrialization
  - A Sun God:
    - Now requires embracement of industrialization
  - The Burgundian Conquest:
    - Lotharingia is now an acceptable tag to complete achievement
  - Back to the Piast
    - Glogow is an acceptable starting nation
    - Opole is an acceptable starting nation
  - Fanatic Collectivist
    - Industrialization now needed to be owned
  - Spaghetti Western
    - Sonora is an acceptable nation switch to