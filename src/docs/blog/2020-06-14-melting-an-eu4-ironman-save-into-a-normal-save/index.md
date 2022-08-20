---
slug: melting-an-eu4-ironman-save-into-a-normal-save
title: "Melting an EU4 Ironman Save into a Normal Save"
banner: melt-banner.jpg
authors: [comagoosie]
description: "There's been a long history of converting (or trying to convert) EU4 ironman saves (a binary format) to their normal counterpart (plaintext). Wanting plaintext saves allows one to use the EU4 to Victoria 2 save converter, console commands, and allows easier access for one to go spleunking through the save file as it can be opened in any text editor. Rakaly now provides its own take on this conversion"
---

<div style={{textAlign: "center"}}>
  <img alt="" width={512} height={236} src={require("./melt-banner.jpg").default} />
</div>

[**Click here to convert (melt) an ironman save to a normal save**](pathname:///)

There's been a long history of converting EU4 ironman saves to their normal counterparts. Wanting plaintext saves allows one to use the EU4 to Victoria 2 save converter, console commands, and allows easier access for one to go spelunking through the save file as it can be opened in any text editor. Rakaly now provides its own take on this conversion.

<!--truncate-->

For those not familiar with EU4 save games, there are 3 types of saves:

 - Uncompressed plaintext files for housing normal and multiplayer games.
 - A zip file that contains the same info split across three plaintext files: ai, gamestate, meta. This format can also be used for normal or multiplayer games when using the compress option in game.
 - Ironman saves use the same zip structure but the files are now in a proprietary binary format.

In another post, we'll document the binary format, but in the meantime, [the post by another tool](https://codeofwar.wbudziszewski.pl/2015/07/29/binary-savegames-insight/) covers about 90% of the format and provides a great jumping off point.

## Prior Art

Rakaly is far from the first attempt at converting (or more poetically, melting) an ironman save to the normal format. Here are all that I'm aware of:

- [Paperman](https://gitgud.io/nixx/paperman) (the most up to date and complete of the three, though gaps still exist)
- [Ironmelt](https://codeofwar.wbudziszewski.pl/ironmelt/) (seems outdated for 1.29 / 1.30)
- [Save Game Replayer](https://bitbucket.org/PreXident/replayer/src/default/) (Dead)

EU4 tools such as [Skanderbeg](https://skanderbeg.pm/) and the [EU4 to Victoria 2 converter](https://eu4.paradoxwikis.com/Europa_Universalis_IV_to_Victoria_II_Converter) (as of this writing) use or recommend paperman for preprocessing.

## Why Another Implementation?

Rakaly's bread and butter is detecting achievements in EU4 ironman saves. This necessitates Rakaly either natively understanding the binary format or have a preprocessing stage with paperman. Since preprocessing could cause an intolerable delay before seeing the results, it was decided from the outset that natively understanding would yield the best performance and accuracy.

Here's the criteria I used when writing a melter that none of the others satisfied:

 - Must be browser based. Forcing a user to download a program to run on their computer can make the user uneasy. There's a threat of spyway or malware. Or maybe their computer doesn't meet the requirements of the applications (eg: must be Windows, while EU4 can be played on macos and linux)
 - Must be fast. Paperman leaves a lot to be desired in terms of performance. Sites that use paperman will cause the browser to freeze for a half a minute during the conversion.
 - Must not require an account to use. All barriers to usage should be eliminated.

After a bit of work, I've arrived at an ironman melter that I'm happy with. The conversion is done in the browser, it's fast, and doesn't require an account. The best part is that I have not identified any gaps and saves I've tried it on have loaded into EU4 perfectly (as far as I can tell). Also future patches should have support day 1.

## What Now?

Rakaly is the newest kid on the block. It's cool (to me at least), and while I've done some testing there may still be a bug or two, so I'd appreciate those who test and provide feedback!
