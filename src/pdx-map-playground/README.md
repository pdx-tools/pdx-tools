# pdx-map playground

This playground showcases how pdx-map can be used with any Paradox Interactive map.

To get started:

```sh
pnpm install
mise run build:wasm
pnpm run dev
```

Navigate to the site and upload any Paradox Interactive map texture (eg: provinces.bmp). The playground will automatically split the map in half and present an interactive view.

Next step is to upload location data that contains color information (like primary and secondary colors). This will normally require parsing the save and joining it with game data, which contains key to the color coded locations. Since that process can get involved, there is an `example-eu4-1.37.bin` in assets to get started.
