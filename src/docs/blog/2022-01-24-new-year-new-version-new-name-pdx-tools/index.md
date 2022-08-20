---
slug: new-year-new-version-new-name-pdx-tools
title: "New year, new version, new name: PDX Tools"
image: banner.jpg
authors: [comagoosie]
description: "Today marks the culmination of nearly a half a year's worth of work. A new version is upon us and it's the biggest yet. The most visible change is the new name! Rakaly is now PDX Tools. The site is now open source and there has been tons of new features like an immersive map, new visualizations, and preliminary support for CK3, HOI4, and Imperator"
---

<div style={{textAlign: "center"}}>
  <img alt="" width={512} height={170} src={require("./banner.jpg").default} />
</div>

Today marks the culmination of nearly a half a year's worth of work. A new version is upon us and it's the biggest yet.

The most visible change is the new name! **Rakaly is now [PDX Tools](http://pdx.tools/)**. 

Not to be outdone, PDX Tools is [completely open source](https://github.com/rakaly/pdx-tools). Two huge changes and we haven't even touched on features.

<!--truncate-->

Onto the questions some may have:

- **Why is the name changing**: PDX Tools is a name that should elicit a more immediate connection with Paradox games. It's more self-descriptive and easier to pronounce (eg: text to speech calls it "rake-a-lee" instead of "ra-ka-lee").
- **What does "PDX" mean**: There is no assigned meaning yet, both "Paradox" or a corny acronym like "Player Designed eXperience" are fine. 
- **What is happening to my saves I've uploaded to Rakaly**: Everything has been migrated over to PDX Tools, so nothing should appear out of place
- **Will Rakaly links stop working**: Users who click on Rakaly links will be redirected to the appropriate pdx.tools address.
- **Is Rakaly disappearing**: The rakali (Australia's otter) will continue as the logo of PDX Tools. It's cute and logos don't have much to do with names anyway. They'll probably be vestiges of the "Rakaly" moniker for awhile as renaming is a bit tedious.

Feel free to discuss the name change on the [discord](https://discord.gg/rCpNWQW).

## New features

### Immersive Map

[![New map is now front and center](map.png)](map.png)
*New map is now front and center*

Upon loading a save, one is greeted by [our new map](/blog/rakaly-status-report-11-map-v2) that takes up the full screen. EU4 is a map based game, so it seemed only fitting that any interface should also be immersed in a map.

The UI is driven by side bar of icons that open a drawer on top of the map.

[![Map with income chart layered on top](headline.png)](headline.png)
*Map with income chart layered on top*

This should make it a bit easier to interpret the data when one knows the state of the world depicted by the map.

An added bonus is that when one clicks on a flag anywhere in the UI, the map will zoom to that nation's capital.

An interesting consequence of a more immersive view, is the new interface is more mobile friendly. So while a desktop environment is still the targeted use case, one should be able to operate the site from a mobile device.

### Country Filter

Country filtering has been greatly improved and standardized in this update. Previously, every module had it's own way of configuring filtering, but all that has changed. Now every module has a filter icon that brings up the same filter drawer. This allows users to view the same set of countries across all the modules. It also effects the map, as only the filtered countries are colored.

Some modules are unable to cope with large outputs. For instance, it doesn't make sense to show the monthly income chart with 300 countries, so these modules will inform the user that the data is being capped.

### CK3, HOI4, and Imperator Support

PDX Tools has always been more than EU4. A thousand years back in 2020, [the CK3 library was announced](/blog/rakaly-status-report-3-crusader-kings-iii), followed shortly after by Imperator and HOI4 libraries. Projects such as the [Paradox Game Converter project](https://github.com/ParadoxGameConverters) and [pdxu](https://github.com/crschnick/pdx_unlimiter) have used these libraries for their melting capabilities (the process of turning a binary save into plaintext). But these capabilities haven't been exposed on the site, until now.

The new update allows one to analyze EU4, HOI4, CK3, and Imperator saves. Functionality is limited for the newly supported games, but it's there and a modular architecture has been proven. Could this all just be a ploy to practice how Vic 3 support would be added? Maybe.

I don't have grand plans on fleshing out the other game implementations due to there only being 24 hours in a day. But since the code is open source, I'm more than happy to bring on contributors who are interested in crafting similar experiences as EU4.

### Religion by Development

There's a new graph in town, and it breaksdown a nation's development and province count by religion:

[![New breakdown of religion by development](religion.png)](religion.png)
*New breakdown of religion by development*

The above graph shows that this nation has 1076 protestant development with 27 sunni development. 

This graph has been helpful for players who are opting to be forced converted by rebels as one needs a plurality of religion by development to be the desired type before the player can then accept the rebel's demands and be converted.

### Pseudo Multi Save Support

The new update allows a bit of an informal way to analyze multiple saves.

- Setup the country filter to the countries you want to track across saves
- Ensure the desired chart is on screen
- Drag and drop a new save onto the site. The new save will be analyzed and the chart updated.

I know it's not ideal, but this should make it easier to compare saves.

## Future

With such a large update, there's bound to be significant bugs, so the immediate future is bug fixing.

Despite the code now being open source, I'm not expecting anything to change, as in, I'm not expecting users to intricately know the code and fix their own bugs. At the very least, I tend to resort to less hacks when open sourcing. But if open sourcing does attract new contributors, I'll be overjoyed.

There's still a large backlog like creating calculations involving modifiers (eg: army morale and discipline), creating a map timeline gif (as our map timeline is more accurate than Paradox's), and more map modes. These will be worked on in time. I'm crossing my fingers that after today I don't redesign the UI for a long time -- it's a time sink. 

While there have been minimal updates to achievements, there have been good ideas presented to me. One idea is to have a program a installed on the user's computer that runs while the game plays and show a notification whenever a completed achievement is detected -- much like Steam does on first completion. The other idea is more of a save integrity scorer. Right now there are some cheating countermeasures but anyone determined enough could find a workaround.

As always feel free to chime in on the [discord](https://discord.gg/rCpNWQW) if you have opinions on these ideas.