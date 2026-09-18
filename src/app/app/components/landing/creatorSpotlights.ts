import florryworryStill from "./creator-gallery/florryworry-paradox-tools-reference.jpg";
import florryworryAvatar from "./creator-gallery/florryworry-avatar.webp";
import ladyMeynethStill from "./creator-gallery/lady-meyneth-pdx-tools-timelapse.jpg";
import ladyMeynethAvatar from "./creator-gallery/lady-meyneth-avatar.webp";
import lambdaxxStill from "./creator-gallery/lambdaxx-pdx-tools-timelapse.jpg";
import lambdaxxAvatar from "./creator-gallery/lambdaxx-avatar.webp";
import radioResStill from "./creator-gallery/radio-res-pdx-tools-mana.jpg";
import radioResAvatar from "./creator-gallery/radio-res-avatar.webp";
import theStudentStill from "./creator-gallery/the-student-pdx-tools.jpg";
import theStudentAvatar from "./creator-gallery/the-student-avatar.webp";
import voxStratagemStill from "./creator-gallery/vox-stratagem-pdx-tools.jpg";
import voxStratagemAvatar from "./creator-gallery/vox-stratagem-avatar.webp";
import zlewikkStill from "./creator-gallery/zlewikk-pdx-tools.jpg";
import zlewikkAvatar from "./creator-gallery/zlewikk-avatar.webp";

export type CreatorSpotlight = {
  id: string;
  name: string;
  platform: "YouTube";
  /** Link to the moment in the video where PDX Tools is on screen. */
  momentUrl: string;
  /** Used for the link label only; the frame itself shows the still and the creator. */
  videoTitle: string;
  /** Position in the video, as shown in the player. */
  timecode: string;
  still: string;
  /** CSS object-position for stills wider than 16:9, so the PDX Tools mark stays in frame. */
  stillPosition?: string;
  avatar: string;
  alt: string;
};

/**
 * Seconds into a YouTube video, as a `t=` query parameter.
 */
function youtubeAt(id: string, seconds: number): string {
  return `https://youtu.be/${id}?t=${seconds}`;
}

export const creatorSpotlights: CreatorSpotlight[] = [
  {
    id: "zlewikk",
    name: "Zlewikk",
    platform: "YouTube",
    momentUrl: youtubeAt("4MnG4LLekGo", 47 * 60 + 54),
    videoTitle: "Doing EU4 True Heir of Timur in HALF of available time",
    timecode: "47:54",
    still: zlewikkStill,
    avatar: zlewikkAvatar,
    alt: "Zlewikk on camera while PDX Tools shows his Mughals campaign map and save details",
  },
  {
    id: "lambdaxx",
    name: "lambdax.x",
    platform: "YouTube",
    momentUrl: youtubeAt("mm6mC3SGQ6U", 41 * 60),
    videoTitle: "True One Tag World Conquest in 1472",
    timecode: "41:00",
    still: lambdaxxStill,
    avatar: lambdaxxAvatar,
    alt: "Still from lambdax.x's EU4 timelapse with PDX.TOOLS visible over the map",
  },
  {
    id: "radio-res",
    name: "Radio Res",
    platform: "YouTube",
    momentUrl: youtubeAt("j7UTpzMiI_g", 7 * 60 + 24),
    videoTitle: "EU4 DON'T TAKE LITHUANIA PU AS POLAND | GUIDE",
    timecode: "7:24",
    still: radioResStill,
    avatar: radioResAvatar,
    alt: "Radio Res stream comparing two PDX Tools ADM mana breakdown charts over the EU4 map",
  },
  {
    id: "the-student",
    name: "TheStudent",
    platform: "YouTube",
    momentUrl: youtubeAt("Q4K5ufNg4is", 31 * 60 + 17),
    videoTitle: "This is how I Restored the Roman Empire in just 29 Years!",
    timecode: "31:17",
    still: theStudentStill,
    avatar: theStudentAvatar,
    alt: "PDX Tools leaderboard in TheStudent's Roman Empire video",
  },
  {
    id: "florryworry",
    name: "Florryworry",
    platform: "YouTube",
    momentUrl: youtubeAt("McVrJey3NCY", 3 * 3600 + 12 * 60 + 4),
    videoTitle: "Preventing the Reformation | #1",
    timecode: "3:12:04",
    still: florryworryStill,
    avatar: florryworryAvatar,
    alt: "Still from Florryworry's EU4 video during his spoken PDX Tools reference",
  },
  {
    id: "vox-stratagem",
    name: "Vox Stratagem",
    platform: "YouTube",
    momentUrl: youtubeAt("HAdIydJrnT0", 58 * 60 + 50),
    videoTitle: "The EU4 Triple Crown",
    timecode: "58:50",
    still: voxStratagemStill,
    avatar: voxStratagemAvatar,
    alt: "Still from Vox Stratagem's video showing a PDX Tools map and analyzer",
  },
  {
    id: "lady-meyneth",
    name: "Lady Meyneth",
    platform: "YouTube",
    momentUrl: youtubeAt("ZFMW9MxIifw", 50),
    videoTitle: "Catalonia One Culture",
    timecode: "0:50",
    still: ladyMeynethStill,
    stillPosition: "right",
    avatar: ladyMeynethAvatar,
    alt: "Still from Lady Meyneth's Catalonia timelapse with PDX.TOOLS visible over the map",
  },
];

export type CommunityQuote = {
  quote: string;
  source: "r/eu4" | "Discord";
  /** Where the quote came from. Kept for provenance; the page does not link to it. */
  url: string;
};

/**
 * Short community remarks. Each one keeps its source link and the wording
 * shown on the source page.
 */
export const communityQuotes: CommunityQuote[] = [
  {
    quote: "dark times before pdx tools",
    source: "Discord",
    url: "https://discord.com/channels/724654026221944872/739946672242557058/1166648812325064734",
  },
  {
    quote: "a really cool website to get useful information about your save games.",
    source: "r/eu4",
    url: "https://www.reddit.com/r/eu4/comments/10o9wdu/",
  },
  {
    quote: "good to know that this site is better at reading eu4 saves than eu4",
    source: "Discord",
    url: "https://discord.com/channels/712465396590182461/712465397135179778/1121087693980446869",
  },
  {
    quote: "quite useful for identifying the best province to Dev an institution",
    source: "r/eu4",
    url: "https://www.reddit.com/r/eu4/comments/1fak0s8/",
  },
  {
    quote: "Pdx tools the GOAT",
    source: "Discord",
    url: "https://discord.com/channels/1135915417395810314/1138177430541049877/1223144281276022846",
  },
  {
    quote: "a really good way to compare how well people are doing in multiplayer",
    source: "r/eu4",
    url: "https://www.reddit.com/r/eu4/comments/18q15ox/",
  },
  {
    quote: "When in doubt just use pdx.tools and you're good",
    source: "Discord",
    url: "https://discord.com/channels/1135915417395810314/1138177430541049877/1409995106194427994",
  },
  {
    quote: "all i know iz pdx tools saved me so much headache in my runs",
    source: "Discord",
    url: "https://discord.com/channels/724654026221944872/739946672242557058/1187752858569936917",
  },
  {
    quote: "It's a fantastic tool.",
    source: "r/eu4",
    url: "https://www.reddit.com/r/eu4/comments/14zcdti/",
  },
  {
    quote: "Shoutout to the new timelapse feature of PDX tools. This is awesome!",
    source: "r/eu4",
    url: "https://www.reddit.com/r/eu4/comments/u0s0g2/",
  },
  {
    quote:
      "Just use the website PDX tools. It will tell you exactly what province to do and how much it will cost.",
    source: "r/eu4",
    url: "https://www.reddit.com/r/eu4/comments/1eo4vu7/",
  },
  {
    quote: "Agree it's absolutely amazing.",
    source: "r/eu4",
    url: "https://www.reddit.com/r/eu4/comments/14zcdti/",
  },
];
