import { Link } from "@/components/Link";
import React from "react";

export const UploadFaq = () => {
  return (
    <dl className="max-w-prose">
      <dt className="mt-4 font-bold">What files can I upload?</dt>
      <dd>
        Any EU4 save that can be understood: normal games, multiplayer games,
        ironman games with and without achievement compatibility. Even modded
        games can be uploaded, though support for those can be limited.
      </dd>
      <dt className="mt-4 font-bold">Can I delete files I upload?</dt>
      <dd>
        Yes you are free to do with the saves as you please. After deleting a
        save it will no longer be accessible to you or others. You can choose to
        reupload it at a later date, but it won't be accessible at the previous
        URL.
      </dd>
      <dt className="mt-4 font-bold">
        Can I download a file on PDX Tools and continue it locally?
      </dt>
      <dd>
        Yes! In fact, PDX Tools losslessly re-encodes saves with a higher
        compression ratio so downloaded saves will be smaller than the original.
      </dd>
      <dt className="mt-4 font-bold">What are the limits on uploads?</dt>
      <dd>
        Compressed saves must not exceed 20MB and 200MB when uncompressed.
      </dd>
      <dt className="mt-4 font-bold">
        Can I get on an achievement leaderboard with an older patch?
      </dt>
      <dd>
        Yes, except that older patches are eligible at an increasing 10% tax to
        the number of days since 1444 to complete the achievement. For instance,
        if 1.31 is the latest patch then saves uploaded on 1.29 will have a 20%
        tax. Whenever a new patch is released, older patches have their tax rate
        increased. This is to facilitate leaderboard freshness so that new runs,
        with all the bugfixes and balancing changes brought by patches, are
        feasible.
      </dd>
      <dt className="mt-4 font-bold">
        My save has achievements that aren't recognized
      </dt>
      <dd>
        Not all achievements are implemented in PDX Tools. Just like how the
        game devs have to implement logic to check if achievement conditions
        have been satisfied, so does PDX Tools. Here's{" "}
        <Link href="/eu4/achievements">
          a list of all implemented achievements
        </Link>
        . The good news is that community input greatly impacts what
        achievements get implemented and custom achievements can be made too!
        Note that achievements are not backdated, so achievements that are
        gained but then "lost" (ie: tag switching, vassal annexation, etc) won't
        be detected.
      </dd>
      <dt className="mt-4 font-bold">
        What happens to runs where I gain multiple achievements?
      </dt>
      <dd>
        It is recommended that when an achievement is completed, to save the
        game and upload it at that point. Only the earliest instance of a
        completed achievement will be used for each achievement leaderboard, so
        if one finds a save from that run from an earlier date, it can be
        uploaded without using a save slot, and the earlier completion date will
        knock the old save off the leaderboard.
      </dd>
      <dt className="mt-4 font-bold">
        Can I mark the uploaded files as private?
      </dt>
      <dd>No, all uploaded files are public.</dd>
      <dt className="mt-4 font-bold">
        I have a suggestion or a question that isn't answered here
      </dt>
      <dd>
        Feel free to get in contact via{" "}
        <Link href="https://discord.gg/rCpNWQW">Discord</Link> or email hi
        [(at)] pdx.tools
      </dd>
    </dl>
  );
};
