# Pdx Assets

Pdx assets defines an asset pipeline for digest assets within a game for wider distribution. The pipeline can run over the game's directory or a zip file called a game bundle.

Game bundles are required to be able to efficiently run the asset pipeline over many games and game versions in a single CI run. Game bundles are produced by running the pipeline and creating a zip file containing every file that was accessed during the pipeline.

Some tasks the asset pipeline is responsible for:

- Splitting images so that they don't exceed common texture size limits on GPUs
- Conversion from incompatible image formats: (eg: `.dds` / `.tga`) to be browser compatible
- Optimize images for size
- Compile game data into prepared flatbuffers data so that the web client can avoid time spent parsing data
- Collate individual images into spritesheet montages.
- Downloading and vendoring imagemagick (windows only).
