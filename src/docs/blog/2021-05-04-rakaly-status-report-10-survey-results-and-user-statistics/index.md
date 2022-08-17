---
slug: rakaly-status-report-10-survey-results-and-user-statistics
title: "Rakaly Status Report #10: Survey Results and User Statistics"
image: banner.jpg
authors: [comagoosie]
description: "Rakaly's first user questionnaire is now closed. Thank you to all who took the time fill out the survey. This post contains the results, some of which are surprising. User events are now captured to determine how popular certain features are."
---

<div style={{textAlign: "center"}}>
  <img alt="" width={512} height={252} src={require("./banner.jpg").default} />
</div>

Rakaly's first user questionnaire is now closed. Thank you to the 20 people who took to the time to fill out the survey. Here are some of the results:

<!--truncate-->

- Most people have heard about Rakaly through reddit or an internet search (most popular search term for users googling is converting ironman saves to normal)
- 1/3 of respondents do not have a Rakaly account. I imagine only users who feel strongly about Rakaly would fill out a survey, so it is surprising that a third do not have an account.
- 3/4 of users are singleplayer with the majority of those preferring ironman
- Users by far loved that one could quickly analyze their save in the browser without needing an account
- Top 3 most wished for features:
  1. More map modes
  2. Deeper analytics involving modifiers
  3. Map gif of campaign
- While not appearing in any of the top lists, there's a consistent use case for users that love the leaderboard and need more achievements
- Respondents that preferred multiplayer games were only lukewarm about sharing saves, which I found curious as most new saves uploaded to rakaly being multiplayer
- Vast majority of respondents believe Rakaly should be supported through donations
- I appreciate everyone who submitted additional thoughts! Thank you for the compliments and ideas. I noted some confusion around Rakaly only implementing a subset of achievements. I implement achievements based on suggestions, so if you have an achievement idea please reach out on the discord or to comagoosie on reddit or the paradox forums.

Part of me wished that I had created a viral post to share [(like the one about trade companies)](/blog/eu4-ai-loves-its-trade-companies), so that I could advertise the survey and get a larger sample size.

To combat downsides of surveys and a low sample size, Rakaly detects user events like "we parsed a save, we melted a save, we opened the casualty table". Knowing actions is invaluable for feature planning, as it seems reasonable that I would spend more time fine tuning popular visualizations. The good news is that I'm stickler for privacy so everything is self-hosted and there is no user tracking, so GDPR is not even a question.

Some insights from running analytics for only a week (no idea if this is typical):

- Most visitors come from youtube, not reddit as one might expect based on the survey responses
- 300 saves parsed / 1000 visualizations rendered
- Half of all saves that are parsed have at least one visualization clicked on
- A quarter of all saves that are parsed end up melted
- Top visualizations:
  1. Political map
  2. Monthly Income
  3. Mana Usage
- A third of users prefer navigating through the visualizations using the key bindings and account for over half of visualizations rendered

With all this data what are my thoughts on the future:

 - More EU4 with increased depth and more map modes. Sounds good to me, especially while I need something to do while leviathan is being fixed.
 - I want to determine why only half of the saves parsed result in the user clicking on an analysis. Loading a save only to melt it would explain some of the behavior. Maybe there are some UX difficulties that can be fixed. I have some experiments I've written down that may be worth trying.
 - I'll setup a way for people to donate to Rakaly for monthly or one time payments

## CK3 Melting Status

A quick note on CK3. With the help from the developer behind the savegame toolbox, [pdxu](https://github.com/crschnick/pdx_unlimiter), Rakaly can melt ironman CK3 saves such that they are continuable in game. This means that it might not be a bad idea to expose a CK3 tab on Rakaly for people to convert their CK3 saves online. Since the survey showed interest in supporting additional games was low, I may mull over the best way to implement this so it doesn't affect the core EU4 experience, but since the functionality is already implemented there aren't a lot of reasons to not expose CK3 in Rakaly.
