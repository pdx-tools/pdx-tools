---
slug: rakaly-now-accepts-all-saves-as-uploads
title: "Rakaly Now Accepts All Saves as Uploads"
authors: [comagoosie]
image: ./rakaly-upload-all-saves.jpg
description: "Today marks the first day that Rakaly allows all saves (patch 1.29 and above) to be uploaded. Previously, only saves that contained record breaking achievements in ironman were accepted. Everyone will get 10 save slots and record breaking ironman saves won't consume a slot. It's a start and things will change but it's been a goal from the start to allow all saves."
---

<div style={{textAlign: "center"}}>
  <img alt="" width={512} height={205} src={require("./rakaly-upload-all-saves.jpg").default} />
</div>

Today marks the first day that Rakaly allows all saves (patch 1.29 and above) to be uploaded. Previously, only saves that contained record breaking achievements in ironman were accepted. Here's how the initial rollout will work:

<!--truncate-->

- Everyone has 10 available save slots that they can upload any patch 1.29 and above save file. Single player, multiplayer, and even mods will be accepted (though mods may look and feel funky in the UI).
- Uploading a save will subtract one from your available slots
- Deleting a save will add one to your available slots
- Saves that contain record breaking achievements in ironman do not use a save slot
- Saves that were record breaking when uploaded, but are no longer (due to increased competition) still do not use a save slot

Now the save gate is open a crack so that we get a feel for how this is going to work. Ever since the first Rakaly post 250 days ago, it's been my intention to allow all saves but I've been sure the best way to go about it. I'm still not sure, but I believe in taking small steps. By allowing all uploads I want to cater to the following players:

- Saves that complete achievements not yet recognized by Rakaly
- Sharing saves and statistics from multiplayer games

Allowing only 10 saves is very limiting, but was done purposely to limit the scope. I want to add in automatic reprocessing of saves as new achievements are added, but reprocessing is not yet implemented. I'm not sure if reprocessing will be expensive in any way (time and / or cost), so I want to keep the corpus of saves small so that there's flexibility. This flexibility allows me to swap out Rakaly components to see what sticks.

Will the 10 save limit ever be lifted? Will one have to pay to have the limit lifted? I don't know. It depends on the success of Rakaly. If no one but me uses it, costs are negligible and the limit can be removed. I'm slowly fleshing out a way for one to have autosaves automatically uploaded as they are generated as certain statistics like dev clicks are not well tracked across time and would require aggregating every save from a playthrough to map them out. As you can imagine, it wouldn't take many users constantly uploading autosaves to quickly swamp any server. 

So we'll see how it goes, feedback is greatly appreciated. Hopefully allowing all saves to be uploaded will be a good experience. 

Before ending, I want to touch back on the topic of reprocessing. I know some competitive players are playfully miffed when their uploaded save is awarded an achievement record when it wasn't one of the achievements they were working towards (eg: this can be seen with the dismantle HRE) and it has been requested that uploaders tag which achievements their save competes in. This request is a bit at odds with automatic reprocessing as a save can be awarded achievements at any time. This makes me view achievements as descriptive tags, a sort of graphical representation of what happened in save rather than a pure competitive viewpoint. Of course, clicking on an achievement would still bring up the achievement leaderboard so this may help set expectations. Another solution is to allow players to mark, on upload, if they want additional achievements tagged as they are discovered. I'll always be biased towards the solution with less code, but I can be convinced otherwise 😄