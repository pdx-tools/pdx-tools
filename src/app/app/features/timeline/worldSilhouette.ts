/**
 * The world, simplified to a silhouette, on a 360 by 180 grid: one degree
 * of longitude and latitude to one unit, the north pole along the top. It
 * is abstract on purpose. The framing thumbnail asks "the whole world, or
 * this part of it?", and the outline only has to be close enough that a
 * frame drawn over it is not questioned.
 *
 * Both games draw this one outline. A game's map is not the whole grid and
 * not always a true equirectangular projection, so each names the rows of
 * the grid its map covers, and the outline is cropped and stretched to the
 * map's own shape. The frame of the current view is drawn in map
 * coordinates over that, so it lands on the coast it lands on in the game,
 * give or take the projection's own warp.
 */
export const WORLD_PATH =
  "M15 22 40 20 60 18 85 17 100 18 118 30 125 43 114 46 104 55 99 65 90 61 83 64 75 70 85 74 96 80 102 82 95 76 75 65 63 58 55 45 45 32 30 30 15 30Z M125 30 160 20 155 7 120 8 110 14 120 24Z M102 82 120 80 130 90 145 97 142 105 132 115 122 128 115 140 110 145 107 135 110 110 100 95Z M171 53 171 47 178 46 175 42 182 39 184 37 188 36 188 33 191 34 193 36 200 35 202 32 205 30 210 30 204 25 208 20 220 22 240 21 240 35 228 43 220 45 218 43 215 45 210 44 208 46 209 49 206 49 203 50 204 52 202 53 200 50 200 48 194 45 192 46 194 49 198 50 196 51 192 48 190 46 188 46 183 48 180 51 178 53Z M185 32 187 28 194 23 202 20 210 20 208 24 202 26 199 30 196 34 192 34 190 31 188 31Z M240 21 255 18 280 13 310 17 340 20 360 22 360 28 340 30 320 35 315 45 305 52 302 60 290 70 285 80 283 88 280 82 275 75 268 68 260 75 257 82 252 70 245 65 237 67 232 75 225 77 223 73 215 60 212 59 216 54 210 54 207 53 206 50 209 49 217 49 220 46 228 43 240 35Z M163 75 170 60 180 54 190 53 200 58 212 59 223 78 231 79 220 95 215 110 212 120 200 125 195 115 192 95 188 86 175 85 172 85 163 78Z M294 112 305 104 317 102 325 105 330 115 332 123 322 129 310 122 295 125Z M174 40 182 39 180 37 178 32 174 32 175 36Z M170 38 174 38 174 35 170 36Z M310 58 316 54 321 48 323 46 320 50 315 56Z M224 103 230 105 228 115 224 114Z M276 85 285 96 300 99 315 95 320 93 330 96 328 100 310 99 295 99 280 92Z";

export type WorldSilhouette = {
  /** The map's width over its height. */
  aspect: number;
  /**
   * The rows of the 180-unit outline the map covers, top and bottom. A map
   * that drops the polar caps names a window inside the grid.
   */
  window: { top: number; bottom: number };
};
