# VOL.STUDIO Linux derleme kabı — Steam Runtime 4 (steamrt4) SDK.
#
# Taban sürümü Deck'te ÖLÇÜLEN çalışma zamanıyla aynıdır
# (PRESSURE_VESSEL_RUNTIME=steamrt4_platform_4.0.20260805.254769):
# derlenen ikili, oyunun içinde koşacağı glibc 2.41'e karşı bağlanır.
# İmajda gcc/clang/meson vardır; WebKit geliştirme paketleri, node ve Rust
# burada eklenir. İmaj katmanları kalıcıdır — apt ağırlığı bir kez ödenir.
FROM registry.gitlab.steamos.cloud/steamrt/steamrt4/sdk:4.0.20260805.254769

ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    ca-certificates \
    curl \
    desktop-file-utils \
    file \
    gstreamer1.0-plugins-base \
    gstreamer1.0-plugins-good \
    gstreamer1.0-tools \
    libgtk-3-dev \
    librsvg2-dev \
    libsoup-3.0-dev \
    libssl-dev \
    libwebkit2gtk-4.1-dev \
    libxdo-dev \
    nodejs \
    npm \
    patchelf \
    pkg-config \
    squashfs-tools \
    xdg-utils \
 && rm -rf /var/lib/apt/lists/*

# Tauri CLI sürümü kök devDependency pinini izler; AppImage üretimi FUSE'süz
# koşar (kap içinde FUSE yoktur).
RUN npm i -g @tauri-apps/cli@2.11.4

# Rust toolchain host'takinden bağımsız kurulur: kap içinde derlenen ikili
# ancak kap toolchain'iyle kabın glibc'sine bağlanır. Sürüm host rustc ile aynı.
RUN curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs \
    | sh -s -- -y --profile minimal --default-toolchain 1.97.1
ENV PATH="/root/.cargo/bin:$PATH"

ENV APPIMAGE_EXTRACT_AND_RUN=1
ENV NO_STRIP=1

WORKDIR /work
