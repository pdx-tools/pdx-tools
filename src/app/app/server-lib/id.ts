import { customAlphabet } from "nanoid";

// A reduced nanoid alphabet that is only numbers + lowercase:
//  - Removal of symbols that may impede copy + paste from URL bar
//  - Removal of upper letters in case files stored as these IDs need to be on a
//    case insensitive file system
//
// Same alphabet used by planetscale (though they don't list reasons for this):
// https://planetscale.com/blog/why-we-chose-nanoids-for-planetscales-api
//
// I'm unsure why I initially went with the default nanoid alphabet at 21
// letters, when a much reduced one is sufficient. While we can't reverse the
// clock on already created users and uploads without some sort of bulk redirect
// scheme in front, we can still have new users and uploads benefit
const alphabet = "0123456789abcdefghijklmnopqrstuvwxyz";
const nanoid = customAlphabet(alphabet);
export const genId = (size?: number | undefined) => nanoid(size);
