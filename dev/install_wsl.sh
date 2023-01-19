docker
if [[ $? -ne 0 ]]; then
	echo "Please set up Docker Desktop on windows and install the WSL integration as well such that the docker command can be called from WSL"
	exit
fi

apt-get update

# Install node js
curl -fsSL https://deb.nodesource.com/setup_19.x | bash -i
apt-get install -y nodejs

# Install rustup
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -i

# Install just
curl -q 'https://proget.makedeb.org/debian-feeds/prebuilt-mpr.pub' | gpg --dearmor | tee /usr/share/keyrings/prebuilt-mpr-archive-keyring.gpg 1> /dev/null
echo "deb [signed-by=/usr/share/keyrings/prebuilt-mpr-archive-keyring.gpg] https://proget.makedeb.org prebuilt-mpr $(lsb_release -cs)" | tee /etc/apt/sources.list.d/prebuilt-mpr.list
apt-get install -y just

# Install other packages
apt-get install -y imagemagick unzip libssl-dev pkg-config

# Set up
just setup

# Install EU4 bundle
EU4_DIR=wslpath "$1"
VERSION="$2"
just pdx create-bundle "$EU4_DIR" assets/game-bundles
just pdx compile-assets "assets/game-bundles/eu4-${VERSION}.tar.zst"

# Start
just dev

